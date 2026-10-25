import type { Transaction } from '@txls/shared'
import { TransactionType } from '@txls/shared'
import { DateTime } from 'luxon'
import { logger } from '../../common/logger.js'
import type { ApiSyncClient, ApiSyncResult, ProviderBalance } from '../types.js'

const BITPANDA_API_BASE = 'https://api.public.bitpanda.com/v1'
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGES = 200

interface BitpandaMoney {
	value: string
	asset_id: string | null
	currency_id: string | null
}

interface BitpandaTrade {
	rate: string
	rate_with_fee?: string
	to_eur_rate: string
	fee?: BitpandaMoney | null
}

interface BitpandaOperationTransaction {
	transaction_id: string
	asset_id: string | null
	currency_id: string | null
	asset_amount: BitpandaMoney
	// Unread for EUR valuation: non-trade fees (deposits/withdrawals) are
	// asset- or currency-denominated without a conversion rate in the payload.
	// Read for reward commission netting (asset-denominated only) — re-check
	// against live payloads via the research.html verification guide.
	fee_amount: BitpandaMoney | null
	transaction_type: string | null
	flow: 'INCOMING' | 'OUTGOING'
	credited_at: string
	compensates: string | null
	trade: BitpandaTrade | null
}

interface BitpandaOperation {
	operation_id: string
	operation_type: string
	transactions: BitpandaOperationTransaction[]
}

interface BitpandaAsset {
	id: string
	attributes?: { symbol?: string }
	symbol?: string
}

// GET /v1/portfolio row (official OpenAPI shape). Fiats and goods live in the
// same list; they carry ids outside the /assets catalog and are skipped by
// the symbol lookup. Balance value is denominated in the row's asset.
interface BitpandaPortfolioItem {
	asset_id?: string | null
	currency_id?: string | null
	balance?: { value?: string; asset_id?: string | null } | null
}

interface BitpandaPage<T> {
	data: T[]
	next_cursor?: string | null
	has_next_page?: boolean
	// Legacy API shape kept as a fallback so a spec drift cannot silently
	// truncate the import to the first page.
	meta?: {
		next_cursor?: string | null
	}
}

const TRANSACTION_TYPE_BY_KEY: Record<string, TransactionType> = {
	'INCOMING/buy': TransactionType.buy,
	'INCOMING/deposit': TransactionType.deposit,
	'INCOMING/reward': TransactionType.reward,
	'INCOMING/staking_reward': TransactionType.reward,
	'INCOMING/onetime_reward': TransactionType.reward,
	'OUTGOING/sell': TransactionType.sell,
	'OUTGOING/withdrawal': TransactionType.withdrawal,
}

// Stake/unstake operations move assets between the user's wallets without
// changing holdings (live payload confirmed both legs of an unstake arrive
// as separate operations). Skipping them explicitly keeps the skip tally
// honest — falling through to the unknown-type tally would mislabel them.
const SKIP_OPERATION_TYPES = new Set(['stake', 'unstake'])

// Bitpanda's EUR-pegged token is excluded both from transaction mapping and
// from portfolio balances — it must not create phantom holdings or drift.
const BCPEUR_SYMBOL = 'BCPEUR'

export class BitpandaApiClient implements ApiSyncClient {
	async testConnection(apiKey: string): Promise<boolean> {
		try {
			const response = await this.fetchApi(`/operations?page_size=1`, apiKey)

			return response.ok
		} catch (error) {
			logger.error({ error }, '[BitpandaApiClient] Connection test failed')
			return false
		}
	}

	async fetchTransactions(apiKey: string): Promise<ApiSyncResult> {
		const [allAssets, allOperations] = await Promise.all([
			this.fetchAllPages<BitpandaAsset>('/assets', apiKey),
			this.fetchAllPages<BitpandaOperation>('/operations', apiKey, (count, page, hasNext) => {
				logger.info(
					{
						page,
						operations: count,
						hasCursor: hasNext,
					},
					'[BitpandaApiClient] Fetched operations page'
				)
			}),
		])

		const symbolsByAssetId = this.buildSymbolMap(allAssets)

		const allTransactions: Transaction[] = []
		const seenTransactionIds = new Set<string>()
		const skipped: Record<string, number> = {}
		const degraded: Record<string, number> = {}
		for (const operation of allOperations) {
			const mapped = operation.transactions
				.map((tx) =>
					this.mapOperationTransactionToTransaction(
						tx,
						operation.operation_type,
						symbolsByAssetId,
						skipped,
						degraded
					)
				)
				.filter((tx): tx is Transaction => tx !== null)
			this.deduplicateSwapFees(mapped)
			for (const tx of mapped) {
				if (seenTransactionIds.has(tx.externalId)) {
					skipped.duplicateTransactionId = (skipped.duplicateTransactionId ?? 0) + 1
					continue
				}
				seenTransactionIds.add(tx.externalId)
				allTransactions.push(tx)
			}
		}

		this.logSkipTally(skipped, degraded)

		logger.info(
			{
				operationsCount: allOperations.length,
				totalCount: allTransactions.length,
			},
			'[BitpandaApiClient] Fetch completed'
		)

		allTransactions.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())

		return {
			transactions: allTransactions,
		}
	}

	async fetchBalances(apiKey: string): Promise<ProviderBalance[]> {
		const [allAssets, portfolioItems] = await Promise.all([
			this.fetchAllPages<BitpandaAsset>('/assets', apiKey),
			this.fetchAllPages<BitpandaPortfolioItem>('/portfolio', apiKey),
		])

		const symbolsByAssetId = this.buildSymbolMap(allAssets)

		const quantityByAsset = new Map<string, number>()
		let unresolvedRows = 0
		let unparsableBalanceRows = 0
		for (const item of portfolioItems) {
			const asset = item.asset_id ? symbolsByAssetId.get(item.asset_id) : undefined
			const value = parseFloat(item.balance?.value ?? '')
			// BCPEUR is excluded from holdings by the transaction mapper; the
			// reconciliation must exclude it here too or it reports drift on
			// every sync. Fiat/goods rows are expected in the portfolio but
			// outside the crypto asset catalog.
			if (!asset || asset === BCPEUR_SYMBOL) {
				unresolvedRows++
				continue
			}
			if (!Number.isFinite(value)) {
				unresolvedRows++
				unparsableBalanceRows++
				continue
			}
			quantityByAsset.set(asset, (quantityByAsset.get(asset) ?? 0) + value)
		}

		logger.info(
			{ rows: portfolioItems.length, unresolved: unresolvedRows },
			'[BitpandaApiClient] Portfolio balances fetched'
		)
		// Unresolved fiat/goods/BCPEUR rows are architecturally expected; only
		// an unparseable balance value on a known crypto asset is unexpected.
		if (unparsableBalanceRows > 0) {
			logger.warn(
				{ rows: portfolioItems.length, unparsableBalanceRows },
				'[BitpandaApiClient] Portfolio balances could not be parsed'
			)
		}

		return Array.from(quantityByAsset.entries()).map(([asset, quantity]) => ({ asset, quantity }))
	}

	private buildSymbolMap(assets: BitpandaAsset[]): Map<string, string> {
		const symbolsByAssetId = new Map<string, string>()
		for (const asset of assets) {
			const symbol = asset.attributes?.symbol ?? asset.symbol
			if (symbol) {
				symbolsByAssetId.set(asset.id, symbol)
			}
		}
		return symbolsByAssetId
	}

	private logSkipTally(skipped: Record<string, number>, degraded: Record<string, number>): void {
		if (Object.keys(degraded).length > 0) {
			logger.warn(
				{ degradedCounts: degraded },
				'[BitpandaApiClient] Degraded transactions imported (see degradedCounts for reasons)'
			)
		}
		if (Object.keys(skipped).length === 0) {
			return
		}
		logger.info({ skipCounts: skipped }, '[BitpandaApiClient] Skipped transactions by reason')
		if (skipped.unknownTransactionType > 0) {
			logger.warn(
				'[BitpandaApiClient] Unknown transaction types were skipped — extend TRANSACTION_TYPE_BY_KEY'
			)
		}
		if (skipped.duplicateTransactionId > 0) {
			logger.warn(
				{ count: skipped.duplicateTransactionId },
				'[BitpandaApiClient] Duplicate transaction ids were skipped'
			)
		}
	}

	private async fetchAllPages<T>(
		endpoint: string,
		apiKey: string,
		onPage?: (count: number, page: number, hasNext: boolean) => void
	): Promise<T[]> {
		const name = endpoint.slice(1)
		const items: T[] = []
		let cursor: string | undefined
		let page = 0

		do {
			if (++page > MAX_PAGES) {
				throw new Error(
					`Bitpanda ${name} pagination exceeded ${MAX_PAGES} pages, aborting to avoid incomplete import`
				)
			}

			let url = `${endpoint}?page_size=${DEFAULT_PAGE_SIZE}`
			if (cursor) {
				url += `&cursor=${encodeURIComponent(cursor)}`
			}

			const response = await this.fetchApi(url, apiKey)
			if (!response.ok) {
				throw new Error(`Failed to fetch ${name}: ${response.status}`)
			}

			const data = (await response.json()) as BitpandaPage<T>
			if (!Array.isArray(data.data)) {
				throw new Error(`Unexpected response shape from Bitpanda ${name} endpoint`)
			}

			const resolvedCursor = data.next_cursor ?? data.meta?.next_cursor ?? undefined
			onPage?.(data.data.length, page, !!resolvedCursor)
			items.push(...data.data)

			if (data.has_next_page && !resolvedCursor) {
				throw new Error(
					`Bitpanda ${name} pagination reported has_next_page without a cursor, aborting to avoid incomplete import`
				)
			}
			if (resolvedCursor && data.has_next_page === false) {
				logger.warn(
					{ endpoint, page, cursor: resolvedCursor },
					'[BitpandaApiClient] Cursor present but has_next_page is false; following cursor anyway'
				)
			}
			cursor = resolvedCursor
		} while (cursor)

		return items
	}

	private mapOperationTransactionToTransaction(
		tx: BitpandaOperationTransaction,
		operationType: string,
		symbolsByAssetId: Map<string, string>,
		skipped: Record<string, number>,
		degraded: Record<string, number>
	): Transaction | null {
		if (SKIP_OPERATION_TYPES.has(operationType)) {
			logger.debug(
				{ transactionId: tx.transaction_id, operationType },
				'[BitpandaApiClient] Skipping stake/unstake operation transaction'
			)
			skipped.stakeUnstake = (skipped.stakeUnstake ?? 0) + 1
			return null
		}

		if (tx.compensates) {
			logger.debug(
				{ transactionId: tx.transaction_id, compensates: tx.compensates },
				'[BitpandaApiClient] Skipping compensated transaction'
			)
			skipped.compensated = (skipped.compensated ?? 0) + 1
			return null
		}

		// Currency-denominated legs (fiat in/out of swaps, fiat interest) are not
		// asset movements — the app tracks crypto holdings only.
		if (!tx.asset_id) {
			logger.debug(
				{ transactionId: tx.transaction_id },
				'[BitpandaApiClient] Skipping currency-denominated fiat leg'
			)
			skipped.fiatLeg = (skipped.fiatLeg ?? 0) + 1
			return null
		}

		const asset = symbolsByAssetId.get(tx.asset_id)
		if (!asset) {
			logger.warn(
				{ transactionId: tx.transaction_id, assetId: tx.asset_id },
				'[BitpandaApiClient] Unknown asset id, skipping transaction'
			)
			skipped.unknownAssetId = (skipped.unknownAssetId ?? 0) + 1
			return null
		}

		// Bitpanda's EUR-pegged token is not a real asset — trading in and out of
		// it must not create phantom holdings or fake cost basis.
		if (asset === BCPEUR_SYMBOL) {
			logger.debug(
				{ transactionId: tx.transaction_id, asset },
				'[BitpandaApiClient] Skipping BCPEUR transaction'
			)
			skipped.bcpeur = (skipped.bcpeur ?? 0) + 1
			return null
		}

		const timestamp = DateTime.fromISO(tx.credited_at)
		if (!timestamp.isValid) {
			logger.warn(
				{ transactionId: tx.transaction_id, creditedAt: tx.credited_at },
				'[BitpandaApiClient] Invalid credited_at, skipping transaction'
			)
			skipped.invalidTimestamp = (skipped.invalidTimestamp ?? 0) + 1
			return null
		}

		const amountValue = parseFloat(tx.asset_amount.value)
		if (!Number.isFinite(amountValue)) {
			logger.warn(
				{ transactionId: tx.transaction_id, assetAmount: tx.asset_amount.value },
				'[BitpandaApiClient] Unparseable asset amount, skipping transaction'
			)
			skipped.unparseableAmount = (skipped.unparseableAmount ?? 0) + 1
			return null
		}

		// Some live payloads (e.g. unstake) carry no per-transaction type; the
		// operation type is the next-best signal for the mapping lookup. `||`
		// also covers an empty-string type, which some APIs use for "absent".
		const effectiveType = tx.transaction_type || operationType
		// Swap fees paid in another asset arrive as their own OUTGOING 'fee' leg;
		// the fee is already captured via trade.fee on the traded legs.
		if (effectiveType === 'fee') {
			logger.debug(
				{ transactionId: tx.transaction_id },
				'[BitpandaApiClient] Skipping fee leg (fee captured via trade.fee)'
			)
			skipped.feeLeg = (skipped.feeLeg ?? 0) + 1
			return null
		}
		const type = TRANSACTION_TYPE_BY_KEY[`${tx.flow}/${effectiveType}`]
		if (!type) {
			logger.debug(
				{
					transactionType: tx.transaction_type,
					operationType,
					flow: tx.flow,
					transactionId: tx.transaction_id,
				},
				'[BitpandaApiClient] Skipping unknown transaction type'
			)
			skipped.unknownTransactionType = (skipped.unknownTransactionType ?? 0) + 1
			return null
		}

		let quantity = Math.abs(amountValue)
		if (type === TransactionType.reward && tx.fee_amount) {
			// Live payloads show staking rewards credited net of an asset-
			// denominated commission (verified: balance_after delta equals
			// gross minus fee), so import the net amount the user actually
			// owns. Only subtract when the commission is denominated in the
			// rewarded asset; anything else would corrupt the quantity. A
			// parseable zero commission is legitimate and nets nothing.
			const rewardFee = Math.abs(parseFloat(tx.fee_amount.value))
			if (!Number.isFinite(rewardFee)) {
				logger.warn(
					{ transactionId: tx.transaction_id, feeValue: tx.fee_amount.value },
					'[BitpandaApiClient] Unparseable reward commission, importing gross quantity'
				)
				degraded.unparseableRewardCommission = (degraded.unparseableRewardCommission ?? 0) + 1
			} else if (rewardFee > 0) {
				if (tx.fee_amount.asset_id !== tx.asset_id) {
					logger.warn(
						{ transactionId: tx.transaction_id, feeAsset: tx.fee_amount.asset_id },
						'[BitpandaApiClient] Reward commission not denominated in the rewarded asset, importing gross quantity'
					)
					degraded.rewardCommissionMismatch = (degraded.rewardCommissionMismatch ?? 0) + 1
				} else {
					quantity = quantity - rewardFee
					if (quantity <= 0) {
						logger.warn(
							{ transactionId: tx.transaction_id },
							'[BitpandaApiClient] Reward fully consumed by commission, skipping'
						)
						skipped.rewardFullyConsumed = (skipped.rewardFullyConsumed ?? 0) + 1
						return null
					}
				}
			}
		}

		let eurRate = 0
		let eurValue = 0
		let eurFee = 0
		if (tx.trade) {
			const toEurRate = parseFloat(tx.trade.to_eur_rate)
			// eurRate must be the clean market rate: it seeds the daily price
			// table (rate_with_fee would store fee-inflated prices that
			// overvalue rewards). eurValue keeps the fee-inclusive effective
			// rate (legacy semantics: the EUR value equals the gross fiat
			// movement of the trade).
			const marketRate = parseFloat(tx.trade.rate)
			const effectiveRate = parseFloat(tx.trade.rate_with_fee ?? tx.trade.rate)
			if (
				Number.isFinite(marketRate) &&
				Number.isFinite(effectiveRate) &&
				Number.isFinite(toEurRate)
			) {
				eurRate = marketRate * toEurRate
				eurValue = quantity * effectiveRate * toEurRate
				eurFee = Math.abs((parseFloat(tx.trade.fee?.value ?? '0') || 0) * toEurRate)
			} else {
				logger.warn(
					{
						transactionId: tx.transaction_id,
						rate: tx.trade.rate,
						toEurRate: tx.trade.to_eur_rate,
					},
					'[BitpandaApiClient] Unparseable trade numbers, importing without EUR values'
				)
				degraded.unparseableTradeNumbers = (degraded.unparseableTradeNumbers ?? 0) + 1
			}
		}

		return {
			id: 0,
			providerAccountId: 0,
			externalId: tx.transaction_id,
			timestamp,
			type,
			asset,
			quantity,
			eurValue,
			eurFee,
			eurRate,
			processed: false,
		}
	}

	private deduplicateSwapFees(transactions: Transaction[]): void {
		const feeLegs = transactions.filter((tx) => tx.eurFee > 0)
		if (feeLegs.length <= 1) return

		// A swap is one operation with two legs; its total fee must be counted
		// once, not per leg. Keep it on the incoming (buy) leg, falling back to
		// the largest reported fee. Invariant assumption: legs of one operation
		// never carry genuinely independent fees (to be verified against live
		// data per the research.html verification guide).
		const keep =
			feeLegs.find((tx) => tx.type === TransactionType.buy) ??
			feeLegs.reduce((a, b) => (b.eurFee > a.eurFee ? b : a))
		for (const tx of feeLegs) {
			if (tx !== keep) {
				tx.eurFee = 0
			}
		}
		logger.debug(
			{ operationExternalIds: feeLegs.map((tx) => tx.externalId) },
			'[BitpandaApiClient] Deduplicated fee across operation legs'
		)
	}

	private async fetchApi(path: string, apiKey: string): Promise<Response> {
		return fetch(`${BITPANDA_API_BASE}${path}`, {
			headers: {
				'x-api-key': apiKey,
				Accept: 'application/json',
			},
			signal: AbortSignal.timeout(30_000),
		})
	}
}
