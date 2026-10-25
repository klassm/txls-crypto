import type { Transaction } from '@txls/shared'
import { TransactionType } from '@txls/shared'
import { inject, injectable } from 'inversify'
import { DateTime } from 'luxon'
import type { DataSource } from 'typeorm'
import { QueryFailedError } from 'typeorm'
import { logger } from '../../common/logger.js'
import { TYPES } from '../../di/types.js'
import { getProviderConfig } from '../../providers/registry.js'
import type { ApiSyncClient } from '../../providers/types.js'
import { broadcastSyncEvent } from '../../websocket.js'
import type { AccountEntity } from '../accounts/account.entity.js'
import type { AccountsRepository } from '../accounts/accounts.repository.js'
import type { AssetHoldingsService } from '../asset-holdings/asset-holdings.service.js'
import type { PriceBackfillService } from '../prices/price-backfill.service.js'
import type { CoinGeckoService } from '../prices/coingecko.service.js'
import type { PricesService } from '../prices/prices.service.js'
import type { TransactionEntity } from '../transactions/transaction.entity.js'
import type { TransactionsRepository } from '../transactions/transactions.repository.js'
import type { TransactionsService } from '../transactions/transactions.service.js'
import type { TransferMatchingService } from '../transfers/transfer-matching.service.js'
import { decrypt } from './encryption.service.js'

export interface SyncResult {
	accountId: number
	success: boolean
	imported: number
	error?: string
}

// Relative tolerance for the post-sync balance reconciliation: a relative
// factor for normal balances, an absolute floor for dust balances. Float
// summation noise and Bitpanda's 8-decimal rounding must not warn.
const BALANCE_RECONCILIATION_TOLERANCE = 1e-6

@injectable()
export class ApiSyncService {
	private syncingAccounts = new Set<number>()
	private syncingUsers = new Set<number>()

	constructor(
		@inject(TYPES.AccountsRepository) private accountsRepo: AccountsRepository,
		@inject(TYPES.TransactionsRepository) private transactionsRepo: TransactionsRepository,
		@inject(TYPES.TransactionsService) private transactionsService: TransactionsService,
		@inject(TYPES.AssetHoldingsService) private holdingsService: AssetHoldingsService,
		@inject(TYPES.PriceBackfillService) private priceBackfillService: PriceBackfillService,
		@inject(TYPES.TransferMatchingService) private transferMatchingService: TransferMatchingService,
		@inject(TYPES.PricesService) private pricesService: PricesService,
		@inject(TYPES.DataSource) private dataSource: DataSource,
		@inject(TYPES.CoinGeckoService) private coinGeckoService: CoinGeckoService
	) {}

	async syncAllAccounts(): Promise<SyncResult[]> {
		const accounts = await this.getEnabledAccounts()
		const results: SyncResult[] = []

		for (const account of accounts) {
			const result = await this.syncAccount(account.id, account.userId)
			results.push(result)
		}

		return results
	}

	async syncAccount(accountId: number, userId: number): Promise<SyncResult> {
		let accountResolved = false
		if (this.syncingAccounts.has(accountId)) {
			logger.warn({ accountId }, '[ApiSyncService] Account already syncing, skipping')
			return { accountId, success: false, imported: 0, error: 'Already syncing' }
		}
		if (this.syncingUsers.has(userId)) {
			logger.warn(
				{ userId },
				'[ApiSyncService] Another account of this user is already syncing, skipping'
			)
			return { accountId, success: false, imported: 0, error: 'User already syncing' }
		}

		try {
			this.syncingAccounts.add(accountId)
			this.syncingUsers.add(userId)

			const account = await this.accountsRepo.findById(userId, accountId)
			if (!account) {
				throw new Error('Account not found')
			}
			accountResolved = true

			// Broadcast as soon as the account is verified: the socket event goes
			// to the requesting user's room, and the error paths below (disabled
			// sync, unsupported provider) must stay paired with a started event.
			broadcastSyncEvent(userId, accountId, 'sync-started', {})

			if (!account.apiEnabled || !account.apiKeyEncrypted) {
				throw new Error('API sync not enabled for this account')
			}

			const providerConfig = getProviderConfig(account.provider)
			if (!providerConfig.apiClient) {
				throw new Error(`Provider ${account.provider} does not support API sync`)
			}

			const apiKey = decrypt(account.apiKeyEncrypted)

			logger.info(
				{
					accountId,
					provider: account.provider,
					fullSync: true,
					hasLastSyncAt: !!account.lastSyncAt,
				},
				'[ApiSyncService] Starting sync'
			)

			return await this.performFullSync(account, apiKey, providerConfig.apiClient)
		} catch (error) {
			let errorMessage = error instanceof Error ? error.message : String(error)
			// Raw database driver messages (SQL fragments, constraint names) must
			// not reach the user-facing syncError; they are logged below under
			// rawError so operators keep the detail.
			if (error instanceof QueryFailedError) {
				errorMessage = 'Database error during sync — see server logs'
			}
			logger.error(
				{
					accountId,
					error: errorMessage,
					rawError: error instanceof Error ? error.message : String(error),
				},
				'[ApiSyncService] Sync failed'
			)

			// The error path must never throw on its own: a failing DB write while
			// recording the failure would abort syncAllAccounts for the remaining
			// accounts. Unresolved accounts (not found / not owned by this user)
			// must never write sync state — updateSyncError is scoped by account id
			// only, so writing would touch another user's account row.
			if (accountResolved) {
				try {
					await this.updateSyncError(accountId, errorMessage)
				} catch (notifyError) {
					logger.error(
						{ accountId, notifyError },
						'[ApiSyncService] Failed to record sync error state'
					)
				}
				// Always send the terminal event: a client that received
				// sync-started must get a paired event even if recording the
				// persisted error state failed.
				try {
					broadcastSyncEvent(userId, accountId, 'sync-error', { error: errorMessage })
				} catch (broadcastError) {
					logger.error(
						{ accountId, broadcastError },
						'[ApiSyncService] Failed to broadcast sync error'
					)
				}
			}

			return { accountId, success: false, imported: 0, error: errorMessage }
		} finally {
			this.syncingAccounts.delete(accountId)
			this.syncingUsers.delete(userId)
		}
	}

	private async performFullSync(
		account: AccountEntity,
		apiKey: string,
		apiClient: ApiSyncClient
	): Promise<SyncResult> {
		const accountId = account.id
		const userId = account.userId

		const result = await apiClient.fetchTransactions(apiKey)

		if (result.transactions.length === 0) {
			logger.info({ accountId }, '[ApiSyncService] No transactions to import')
			await this.updateSyncSuccess(account)
			this.broadcastCompleteEvent(userId, accountId, 0)
			return { accountId, success: true, imported: 0 }
		}

		const earliestTimestamp = this.getEarliestTimestamp(result.transactions)

		const {
			txImportResult: importResult,
			toImport,
			deletedRowCount,
		} = await this.dataSource.transaction(async (em) => {
			// Only replace the window the API actually serves: /v1/operations
			// exposes roughly the last 17 months, so a full delete would wipe
			// older history (legacy CSV imports, pre-window rewards) every sync.
			const deletedRowCount = await this.transactionsRepo.deleteByAccountFromTimestamp(
				userId,
				accountId,
				earliestTimestamp.toMillis(),
				em
			)

			// The duplicate check in importTransactions is scoped by user, not
			// account: rows this account just lost may still exist for the same
			// user in another account (e.g. legacy CSV imports). Skipping them
			// matches legacy behavior; treating them as row errors would roll
			// back every future full replace.
			const externalIds = result.transactions.map((tx) => tx.externalId)
			const existingElsewhere = await this.transactionsRepo.findManyByExternalIdsIn(
				userId,
				externalIds,
				em
			)
			const existingIds = new Set(existingElsewhere.map((tx) => tx.externalId))
			const toImport =
				existingIds.size > 0
					? result.transactions.filter((tx) => !existingIds.has(tx.externalId))
					: result.transactions
			if (existingIds.size > 0) {
				logger.warn(
					{ accountId, count: existingIds.size },
					'[ApiSyncService] Transactions already exist for this user in another account, skipping'
				)
			}

			const txImportResult = await this.transactionsService.importTransactions(
				userId,
				accountId,
				toImport,
				em
			)
			// A partial import must never replace the account's full history:
			// throwing rolls the delete + import back atomically. The row error
			// details stay in the server log — raw driver messages must not reach
			// the user-facing syncError.
			if (txImportResult.errors.length > 0) {
				logger.error(
					{ accountId, rowErrors: txImportResult.errors },
					'[ApiSyncService] Import reported row errors, rolling back replace transaction'
				)
				throw new Error(
					`Import reported row errors for ${txImportResult.errors.length} transaction(s), rolling back`
				)
			}
			return { txImportResult, toImport, deletedRowCount }
		})

		const savedTransactions = await this.getSavedTransactions(userId, toImport)

		if (savedTransactions.length > 0 || deletedRowCount > 0) {
			if (savedTransactions.length > 0) {
				await this.runPipelineStage(accountId, 'price-backfill', () =>
					this.priceBackfillService.storePricesFromTransactions(savedTransactions)
				)
				await this.runPipelineStage(accountId, 'reward-valuation', () =>
					this.backfillRewardValues(savedTransactions)
				)
			} else {
				// The gate implies deletedRowCount > 0 here: the replace
				// transaction emptied this account because every fetched
				// transaction lived in another account of this user. Holdings
				// and transfer matching still see the deletion and must be
				// rebuilt.
				logger.warn(
					{ accountId, deletedRowCount },
					'[ApiSyncService] Account emptied by cross-account dedupe, rebuilding holdings'
				)
			}
			await this.runPipelineStage(accountId, 'transfer-matching', () =>
				this.transferMatchingService.matchTransfersForUser(userId)
			)
			await this.runPipelineStage(accountId, 'holdings-rebuild', () =>
				this.holdingsService.rebuildHoldingsFromTimestamp(userId, accountId, earliestTimestamp)
			)
			await this.reconcileBalances(accountId, userId, apiKey, apiClient)
		}

		await this.updateSyncSuccess(account)

		logger.info(
			{ accountId, imported: importResult.imported, errors: importResult.errors.length },
			'[ApiSyncService] Full sync completed'
		)

		this.broadcastCompleteEvent(userId, accountId, importResult.imported)

		return { accountId, success: true, imported: importResult.imported }
	}

	// Same defensive wrapper as the sync-error broadcast: a throwing emit
	// after updateSyncSuccess must not flip a completed sync into an error.
	private broadcastCompleteEvent(userId: number, accountId: number, imported: number): void {
		try {
			broadcastSyncEvent(userId, accountId, 'sync-complete', { imported })
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			logger.error(
				{ accountId, error: errorMessage },
				'[ApiSyncService] Failed to broadcast sync complete'
			)
		}
	}

	async validateApiKey(
		provider: string,
		apiKey: string
	): Promise<{ valid: boolean; error?: string }> {
		const providerConfig = getProviderConfig(provider)
		if (!providerConfig.apiClient) {
			return { valid: false, error: 'Provider does not support API sync' }
		}

		try {
			const valid = await providerConfig.apiClient.testConnection(apiKey)
			if (valid) {
				return { valid: true }
			}
			return { valid: false, error: 'Invalid API key' }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			return { valid: false, error: errorMessage }
		}
	}

	isSyncing(accountId: number, userId: number): boolean {
		return this.syncingAccounts.has(accountId) || this.syncingUsers.has(userId)
	}

	/**
	 * Reward operations from the Bitpanda API carry no EUR value. Value them
	 * from the stored daily prices seeded by this sync's trades (rewards never
	 * seed prices themselves). Rewards without a stored price stay at 0.
	 */
	private async backfillRewardValues(savedTransactions: TransactionEntity[]): Promise<void> {
		const unvaluedRewards = savedTransactions.filter(
			(tx) => tx.type === TransactionType.reward && !(tx.eurValue > 0)
		)
		if (unvaluedRewards.length === 0) {
			return
		}

		const valued: TransactionEntity[] = []
		const priceByAssetAndDay = new Map<string, number | null>()
		for (const reward of unvaluedRewards) {
			const cacheKey = `${reward.asset}|${reward.timestamp.toISODate()}`
			if (!priceByAssetAndDay.has(cacheKey)) {
				const price = await this.pricesService.getPriceForDate(reward.asset, reward.timestamp)
				priceByAssetAndDay.set(cacheKey, price ? price.priceEur : null)
			}
			const priceEur = priceByAssetAndDay.get(cacheKey)
			if (priceEur == null) {
				continue
			}
			reward.eurRate = priceEur
			reward.eurValue = reward.quantity * priceEur
			valued.push(reward)
		}

		await this.backfillRewardValuesFromHistory(unvaluedRewards, valued, priceByAssetAndDay)

		if (valued.length === 0) {
			return
		}

		logger.info({ count: valued.length }, '[ApiSyncService] Valued staking rewards')
		await this.transactionsRepo.saveMany(valued)
	}

	// Rewards whose day had no stored price: fetch CoinGecko historical
	// daily prices once per asset, store them, then re-look-up the missing
	// days. Best-effort — a failure here leaves rewards unvalued but must
	// never fail the sync.
	private async backfillRewardValuesFromHistory(
		unvaluedRewards: TransactionEntity[],
		valued: TransactionEntity[],
		priceByAssetAndDay: Map<string, number | null>
	): Promise<void> {
		const missingByAsset = new Map<string, TransactionEntity[]>()
		for (const reward of unvaluedRewards) {
			if (priceByAssetAndDay.get(`${reward.asset}|${reward.timestamp.toISODate()}`) != null) {
				continue
			}
			const rewards = missingByAsset.get(reward.asset) ?? []
			rewards.push(reward)
			missingByAsset.set(reward.asset, rewards)
		}
		if (missingByAsset.size === 0) {
			return
		}

		try {
			for (const [asset, rewards] of missingByAsset) {
				const earliest = rewards.reduce((min, r) => Math.min(min, r.timestamp.toMillis()), Number.POSITIVE_INFINITY)
				// CoinGecko's public API only serves the last 365 days of
				// historical data; older rewards stay unvalued.
				const days = Math.min(
					365,
					Math.max(1, Math.ceil((DateTime.utc().toMillis() - earliest) / 86_400_000) + 1)
				)
				const historical = await this.coinGeckoService.fetchHistoricalDailyPrices(asset, days)
				if (historical.length === 0) {
					continue
				}
				await this.pricesService.savePrices(historical)

				for (const reward of rewards) {
					const price = await this.pricesService.getPriceForDate(reward.asset, reward.timestamp)
					if (!price) {
						continue
					}
					priceByAssetAndDay.set(`${reward.asset}|${reward.timestamp.toISODate()}`, price.priceEur)
					reward.eurRate = price.priceEur
					reward.eurValue = reward.quantity * price.priceEur
					valued.push(reward)
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			logger.warn(
				{ error: errorMessage },
				'[ApiSyncService] CoinGecko historical price fallback failed (rewards stay unvalued)'
			)
		}
	}

	private async runPipelineStage(
		accountId: number,
		stage: string,
		run: () => Promise<unknown>
	): Promise<void> {
		try {
			await run()
		} catch (error) {
			logger.error(
				{ accountId, stage, error },
				'[ApiSyncService] Post-import pipeline stage failed'
			)
			throw error
		}
	}

	private async getEnabledAccounts(): Promise<AccountEntity[]> {
		return this.accountsRepo.findEnabledApiSyncAccounts()
	}

	private getEarliestTimestamp(transactions: Transaction[]): DateTime {
		const earliest = transactions.reduce(
			(min, t) => Math.min(min, t.timestamp.toMillis()),
			Number.POSITIVE_INFINITY
		)
		return DateTime.fromMillis(earliest, { zone: 'utc' })
	}

	private async getSavedTransactions(
		userId: number,
		transactions: Transaction[]
	): Promise<TransactionEntity[]> {
		const externalIds = transactions.map((t) => t.externalId)
		return this.transactionsRepo.findManyByExternalIds(userId, externalIds)
	}

	private async updateSyncSuccess(account: AccountEntity): Promise<void> {
		await this.accountsRepo.updateSyncSuccess(account)
	}

	private async updateSyncError(accountId: number, error: string): Promise<void> {
		await this.accountsRepo.updateSyncError(accountId, error)
	}

	/**
	 * Compares the rebuilt account holdings against the provider's actual
	 * balances (Bitpanda GET /v1/portfolio). The provider value is the ground
	 * truth, so drift means the imported transaction set is incomplete or
	 * mis-mapped (e.g. a skipped transaction type) — surfaced as a warning,
	 * never as a sync failure.
	 */
	private async reconcileBalances(
		accountId: number,
		userId: number,
		apiKey: string,
		apiClient: ApiSyncClient
	): Promise<void> {
		if (typeof apiClient.fetchBalances !== 'function') {
			return
		}
		try {
			const [providerBalances, holdings] = await Promise.all([
				apiClient.fetchBalances(apiKey),
				this.holdingsService.getCurrentHoldings(userId, accountId),
			])

			const providerQuantity = new Map(providerBalances.map((b) => [b.asset, b.quantity]))
			const holdingsQuantity = new Map(holdings.map((h) => [h.asset, h.amount]))
			const assets = new Set([...providerQuantity.keys(), ...holdingsQuantity.keys()])

			const drift: Array<{ asset: string; app: number; provider: number }> = []
			for (const asset of assets) {
				const app = holdingsQuantity.get(asset) ?? 0
				const provider = providerQuantity.get(asset) ?? 0
				// Tolerance anchored to max(1, |provider|): a relative factor for
				// normal balances and an absolute 1e-6 floor for dust balances.
				// Float summation noise and 8-decimal rounding must not warn;
				// real drift (missing or mis-mapped transactions) is far larger.
				if (
					Math.abs(app - provider) >
					BALANCE_RECONCILIATION_TOLERANCE * Math.max(1, Math.abs(provider))
				) {
					drift.push({ asset, app, provider })
				}
			}

			if (drift.length > 0) {
				logger.warn(
					{ accountId, count: drift.length, drift },
					'[ApiSyncService] Balance reconciliation drift detected'
				)
			} else {
				logger.info({ accountId }, '[ApiSyncService] Balance reconciliation passed')
			}
		} catch (error) {
			// A reconciliation problem must never fail the sync itself.
			const errorMessage = error instanceof Error ? error.message : String(error)
			logger.warn(
				{ accountId, error: errorMessage },
				'[ApiSyncService] Balance reconciliation failed (non-fatal)'
			)
		}
	}
}
