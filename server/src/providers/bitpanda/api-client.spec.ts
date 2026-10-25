import { TransactionType } from '@txls/shared'
import nock from 'nock'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { logger } from '../../common/logger.js'
import { BitpandaApiClient } from './api-client.js'

const API_KEY = 'test-api-key-12345'
const PUBLIC_API_BASE = 'https://api.public.bitpanda.com/v1'

const BTC_ASSET_ID = 'btc-uuid-1'
const ETH_ASSET_ID = 'eth-uuid-2'

const BTC_ASSET = { id: BTC_ASSET_ID, symbol: 'BTC' }
const ETH_ASSET = { id: ETH_ASSET_ID, symbol: 'ETH' }

function mockAssets(assets: Array<{ id: string; symbol: string }>) {
	nock(PUBLIC_API_BASE)
		.get('/assets')
		.query({ page_size: 100 })
		.reply(200, {
			data: assets.map((asset) => ({ id: asset.id, attributes: { symbol: asset.symbol } })),
		})
}

function mockOperations(operations: unknown[], options: { nextCursor?: string } = {}) {
	nock(PUBLIC_API_BASE)
		.get('/operations')
		.query({ page_size: 100 })
		.reply(200, {
			data: operations,
			self_cursor: null,
			next_cursor: options.nextCursor ?? null,
			has_next_page: !!options.nextCursor,
		})
}

function mockOperationsPage(
	cursor: string,
	operations: unknown[],
	options: { nextCursor?: string } = {}
) {
	nock(PUBLIC_API_BASE)
		.get('/operations')
		.query({ page_size: 100, cursor })
		.reply(200, {
			data: operations,
			self_cursor: cursor,
			next_cursor: options.nextCursor ?? null,
			has_next_page: !!options.nextCursor,
		})
}

function operation(operations: unknown[], overrides: Record<string, unknown> = {}) {
	return { operation_id: 'op-1', operation_type: 'trade', transactions: operations, ...overrides }
}

function transaction(overrides: Record<string, unknown> = {}) {
	return {
		transaction_id: 'tx-1',
		asset_id: BTC_ASSET_ID,
		currency_id: 'eur-uuid',
		asset_amount: { value: '0.05', asset_id: BTC_ASSET_ID, currency_id: null },
		fee_amount: null,
		transaction_type: 'buy',
		flow: 'INCOMING',
		credited_at: '2024-01-15T10:00:00+01:00',
		asset_balance_after: '0.05',
		compensates: null,
		trade: { rate: '20000', to_eur_rate: '1', fee: { value: '1.50' } },
		...overrides,
	}
}

describe('BitpandaApiClient', () => {
	let client: BitpandaApiClient

	beforeAll(() => {
		client = new BitpandaApiClient()
		nock.disableNetConnect()
	})

	afterAll(() => {
		nock.enableNetConnect()
	})

	afterEach(() => {
		nock.cleanAll()
	})

	describe('testConnection', () => {
		it('should return true for valid API key', async () => {
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 1 })
				.matchHeader('x-api-key', API_KEY)
				.reply(200, { data: [], next_cursor: null, has_next_page: false })

			const result = await client.testConnection(API_KEY)
			expect(result).toBe(true)
		})

		it('should return false for invalid API key (401)', async () => {
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 1 })
				.reply(401, { error: 'Unauthorized' })

			const result = await client.testConnection(API_KEY)
			expect(result).toBe(false)
		})

		it('should return false on network error', async () => {
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 1 })
				.replyWithError('Network error')

			const result = await client.testConnection(API_KEY)
			expect(result).toBe(false)
		})
	})

	describe('fetchTransactions', () => {
		it('should map a buy operation to a buy transaction', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([operation([transaction()])])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(1)
			const buyTx = result.transactions[0]
			expect(buyTx.type).toBe(TransactionType.buy)
			expect(buyTx.externalId).toBe('tx-1')
			expect(buyTx.asset).toBe('BTC')
			expect(buyTx.quantity).toBe(0.05)
			expect(buyTx.eurRate).toBe(20000)
			expect(buyTx.eurValue).toBe(1000)
			expect(buyTx.eurFee).toBe(1.5)
		})

		it('should map reward transaction types to reward with zero EUR values', async () => {
			mockAssets([BTC_ASSET, ETH_ASSET])
			mockOperations([
				operation(
					[
						transaction({
							transaction_id: 'tx-reward-1',
							transaction_type: 'reward',
							asset_id: ETH_ASSET_ID,
							asset_amount: { value: '0.01', asset_id: ETH_ASSET_ID, currency_id: null },
							trade: null,
						}),
					],
					{ operation_type: 'earning' }
				),
				operation(
					[
						transaction({
							transaction_id: 'tx-reward-2',
							transaction_type: 'staking_reward',
							asset_id: ETH_ASSET_ID,
							asset_amount: { value: '0.02', asset_id: ETH_ASSET_ID, currency_id: null },
							trade: null,
						}),
					],
					{ operation_type: 'earning' }
				),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(2)
			for (const tx of result.transactions) {
				expect(tx.type).toBe(TransactionType.reward)
				expect(tx.eurValue).toBe(0)
				expect(tx.eurRate).toBe(0)
				expect(tx.eurFee).toBe(0)
			}
			expect(result.transactions.find((t) => t.externalId === 'tx-reward-1')?.quantity).toBe(0.01)
			expect(result.transactions.find((t) => t.externalId === 'tx-reward-2')?.quantity).toBe(0.02)
		})

		it('should import both legs of a swap operation', async () => {
			mockAssets([BTC_ASSET, ETH_ASSET])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-swap-in',
						asset_id: BTC_ASSET_ID,
						asset_amount: { value: '0.05', asset_id: BTC_ASSET_ID, currency_id: null },
						transaction_type: 'buy',
						flow: 'INCOMING',
						trade: { rate: '20000', to_eur_rate: '1', fee: { value: '9.90' } },
					}),
					transaction({
						transaction_id: 'tx-swap-out',
						asset_id: ETH_ASSET_ID,
						asset_amount: { value: '-0.6', asset_id: ETH_ASSET_ID, currency_id: null },
						transaction_type: 'sell',
						flow: 'OUTGOING',
						trade: { rate: '1666.66', to_eur_rate: '1', fee: { value: '0' } },
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(2)
			const buyTx = result.transactions.find((t) => t.externalId === 'tx-swap-in')
			const sellTx = result.transactions.find((t) => t.externalId === 'tx-swap-out')
			expect(buyTx?.type).toBe(TransactionType.buy)
			expect(buyTx?.asset).toBe('BTC')
			expect(sellTx?.type).toBe(TransactionType.sell)
			expect(sellTx?.asset).toBe('ETH')
			expect(sellTx?.quantity).toBe(0.6)
			expect(sellTx?.eurValue).toBeCloseTo(999.996, 2)
		})

		it('should count a swap fee only once when both legs report it', async () => {
			mockAssets([BTC_ASSET, ETH_ASSET])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-swap-in',
						asset_id: BTC_ASSET_ID,
						asset_amount: { value: '0.05', asset_id: BTC_ASSET_ID, currency_id: null },
						transaction_type: 'buy',
						flow: 'INCOMING',
						trade: { rate: '20000', to_eur_rate: '1', fee: { value: '9.90' } },
					}),
					transaction({
						transaction_id: 'tx-swap-out',
						asset_id: ETH_ASSET_ID,
						asset_amount: { value: '-0.6', asset_id: ETH_ASSET_ID, currency_id: null },
						transaction_type: 'sell',
						flow: 'OUTGOING',
						trade: { rate: '1666.66', to_eur_rate: '1', fee: { value: '9.90' } },
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			const buyTx = result.transactions.find((t) => t.externalId === 'tx-swap-in')
			const sellTx = result.transactions.find((t) => t.externalId === 'tx-swap-out')
			expect(buyTx?.eurFee).toBe(9.9)
			expect(sellTx?.eurFee).toBe(0)
		})

		it('should map deposits and withdrawals without trade data', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-deposit',
						transaction_type: 'deposit',
						flow: 'INCOMING',
						trade: null,
						fee_amount: { value: '0.0001', asset_id: BTC_ASSET_ID, currency_id: null },
					}),
				]),
				operation([
					transaction({
						transaction_id: 'tx-withdrawal',
						transaction_type: 'withdrawal',
						flow: 'OUTGOING',
						asset_amount: { value: '-0.1', asset_id: BTC_ASSET_ID, currency_id: null },
						trade: null,
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(2)
			const depositTx = result.transactions.find((t) => t.externalId === 'tx-deposit')
			const withdrawalTx = result.transactions.find((t) => t.externalId === 'tx-withdrawal')
			expect(depositTx?.type).toBe(TransactionType.deposit)
			expect(depositTx?.quantity).toBe(0.05)
			expect(depositTx?.eurValue).toBe(0)
			expect(depositTx?.eurFee).toBe(0)
			expect(withdrawalTx?.type).toBe(TransactionType.withdrawal)
			expect(withdrawalTx?.quantity).toBe(0.1)
		})

		it('should add asset-denominated fees to the withdrawal quantity (wallet debit is amount + fee)', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-withdrawal-fee',
						transaction_type: 'withdrawal',
						flow: 'OUTGOING',
						asset_amount: { value: '-304.73', asset_id: BTC_ASSET_ID, currency_id: null },
						fee_amount: { value: '0.5', asset_id: BTC_ASSET_ID, currency_id: null },
						trade: null,
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(1)
			const tx = result.transactions[0]
			expect(tx.type).toBe(TransactionType.withdrawal)
			expect(tx.quantity).toBeCloseTo(305.23, 6)
		})

		it('should skip transactions with an unparseable asset amount', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({ asset_amount: { value: '', asset_id: BTC_ASSET_ID, currency_id: null } }),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should not produce NaN EUR values when trade numbers are unparseable', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({
						trade: { rate: '', to_eur_rate: '', fee: { value: '' } },
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(1)
			const tx = result.transactions[0]
			expect(tx.eurRate).toBe(0)
			expect(tx.eurValue).toBe(0)
			expect(tx.eurFee).toBe(0)
		})

		it('should skip stake and unstake operations explicitly', async () => {
			mockAssets([BTC_ASSET])
			const unstakeLeg = {
				transaction_id: 'tx-unstake-1',
				asset_id: BTC_ASSET_ID,
				asset_amount: { value: '0.34', asset_id: BTC_ASSET_ID },
				transaction_type: undefined,
				flow: 'OUTGOING',
				credited_at: '2024-01-15T10:00:00+01:00',
				compensates: null,
				trade: null,
			}
			mockOperations([
				operation([unstakeLeg], { operation_id: 'op-u1', operation_type: 'unstake' }),
				operation([{ ...unstakeLeg, transaction_id: 'tx-unstake-2', flow: 'INCOMING' }], {
					operation_id: 'op-u2',
					operation_type: 'unstake',
				}),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(0)
				const tallyCall = infoSpy.mock.calls.find(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCall?.[0]).toMatchObject({ skipCounts: { stakeUnstake: 2 } })
			} finally {
				infoSpy.mockRestore()
			}
		})

		it('should import only the crypto legs of a swap and skip fiat legs', async () => {
			mockAssets([BTC_ASSET])
			const fiatLeg = {
				transaction_id: 'tx-fiat-in',
				asset_id: null,
				asset_amount: { value: '152.5', currency_id: 'eur-uuid' },
				transaction_type: 'sell',
				flow: 'INCOMING',
				credited_at: '2024-01-15T10:00:00+01:00',
				compensates: null,
				trade: null,
			}
			mockOperations([
				operation([
					fiatLeg,
					transaction({
						transaction_id: 'tx-crypto-sell',
						transaction_type: 'sell',
						flow: 'OUTGOING',
						asset_amount: { value: '-152.5', asset_id: BTC_ASSET_ID, currency_id: null },
						trade: { rate: '1', to_eur_rate: '1', fee: { value: '0' } },
					}),
					{ ...fiatLeg, transaction_id: 'tx-fiat-out', transaction_type: 'buy', flow: 'OUTGOING' },
					transaction(),
				]),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(2)
				const tallyCall = infoSpy.mock.calls.find(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCall?.[0]).toMatchObject({ skipCounts: { fiatLeg: 2 } })
			} finally {
				infoSpy.mockRestore()
			}
		})

		it('should import in-kind fee legs as withdrawals and value buys with the effective rate', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-buy-leg',
						asset_amount: { value: '0.00202756', asset_id: BTC_ASSET_ID, currency_id: null },
						transaction_type: 'buy',
						flow: 'INCOMING',
						trade: {
							rate: '74096.23331152',
							rate_with_fee: '75213.18674122',
							to_eur_rate: '1',
							fee: { value: '1.51' },
						},
					}),
					transaction({
						transaction_id: 'tx-fee-leg',
						asset_id: BTC_ASSET_ID,
						asset_amount: { value: '-94.82', asset_id: BTC_ASSET_ID, currency_id: null },
						transaction_type: 'fee',
						flow: 'OUTGOING',
						trade: null,
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(2)
				const buyTx = result.transactions.find((t) => t.type === TransactionType.buy)
				expect(buyTx?.eurValue).toBeCloseTo(152.5, 2)
				expect(buyTx?.eurFee).toBeCloseTo(1.51, 2)
				// eurRate is the clean market rate (fee excluded): it seeds the
				// daily price table used for reward valuation.
				expect(buyTx?.eurRate).toBeCloseTo(74096.23331152, 4)
				// The fee leg debited real BTC from the wallet (verified live:
				// a swap fee paid in kind) — it must reduce holdings.
				const feeTx = result.transactions.find((t) => t.type === TransactionType.withdrawal)
				expect(feeTx?.externalId).toBe('tx-fee-leg')
				expect(feeTx?.quantity).toBeCloseTo(94.82, 6)
				expect(feeTx?.eurValue).toBe(0)
		})

		it('should import reward quantity net of the asset-denominated commission', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation(
					[
						transaction({
							transaction_id: 'tx-reward-net',
							transaction_type: null,
							asset_amount: { value: '0.42213338', asset_id: BTC_ASSET_ID, currency_id: null },
							fee_amount: { value: '0.08442668', asset_id: BTC_ASSET_ID, currency_id: null },
							trade: null,
						}),
					],
					{ operation_type: 'reward' }
				),
				operation(
					[
						transaction({
							transaction_id: 'tx-onetime',
							transaction_type: null,
							asset_amount: { value: '152.5', asset_id: BTC_ASSET_ID, currency_id: null },
							fee_amount: { value: '0', asset_id: BTC_ASSET_ID, currency_id: null },
							trade: null,
						}),
					],
					{ operation_type: 'onetime_reward' }
				),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(2)
			const netReward = result.transactions.find((t) => t.externalId === 'tx-reward-net')
			expect(netReward?.type).toBe(TransactionType.reward)
			expect(netReward?.quantity).toBeCloseTo(0.3377067, 7)
			const oneTime = result.transactions.find((t) => t.externalId === 'tx-onetime')
			expect(oneTime?.type).toBe(TransactionType.reward)
			expect(oneTime?.quantity).toBe(152.5)
		})

		it('should keep the gross quantity when the reward commission is not asset-denominated', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation(
					[
						transaction({
							transaction_id: 'tx-reward-eur-fee',
							transaction_type: null,
							asset_amount: { value: '0.42', asset_id: BTC_ASSET_ID, currency_id: null },
							fee_amount: { value: '0.08', asset_id: null, currency_id: 'eur-uuid' },
							trade: null,
						}),
					],
					{ operation_type: 'reward' }
				),
			])

			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(1)
				expect(result.transactions[0].quantity).toBe(0.42)
				const degradedWarn = warnSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'degradedCounts' in (arg as object)
				)
				expect(degradedWarn).toHaveLength(1)
				expect(degradedWarn[0][0]).toMatchObject({
					degradedCounts: { rewardCommissionMismatch: 1 },
				})
			} finally {
				warnSpy.mockRestore()
			}
		})

		it('should keep the gross quantity and degrade when the reward commission does not parse', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation(
					[
						transaction({
							transaction_id: 'tx-reward-bad-fee',
							transaction_type: null,
							asset_amount: { value: '0.42', asset_id: BTC_ASSET_ID, currency_id: null },
							fee_amount: { value: 'abc', asset_id: BTC_ASSET_ID, currency_id: null },
							trade: null,
						}),
					],
					{ operation_type: 'reward' }
				),
			])

			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(1)
				expect(result.transactions[0].quantity).toBe(0.42)
				const degradedWarn = warnSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'degradedCounts' in (arg as object)
				)
				expect(degradedWarn).toHaveLength(1)
				expect(degradedWarn[0][0]).toMatchObject({
					degradedCounts: { unparseableRewardCommission: 1 },
				})
			} finally {
				warnSpy.mockRestore()
			}
		})

		it('should fall back to the operation type for an empty-string transaction type', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ transaction_id: 'tx-empty-type', transaction_type: '' })], {
					operation_type: 'deposit',
				}),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(1)
			expect(result.transactions[0].type).toBe(TransactionType.deposit)
		})

		it('should skip a reward fully consumed by its commission with its own tally', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation(
					[
						transaction({
							transaction_id: 'tx-reward-consumed',
							transaction_type: null,
							asset_amount: { value: '0.08442668', asset_id: BTC_ASSET_ID, currency_id: null },
							fee_amount: { value: '0.08442668', asset_id: BTC_ASSET_ID, currency_id: null },
							trade: null,
						}),
					],
					{ operation_type: 'reward' }
				),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(0)
				const tallyCall = infoSpy.mock.calls.find(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCall?.[0]).toMatchObject({ skipCounts: { rewardFullyConsumed: 1 } })
			} finally {
				infoSpy.mockRestore()
			}
		})

		it('should skip transfer operations (stake/unstake and wallet-internal moves)', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ transaction_type: 'transfer' })], {
					operation_type: 'transfer',
				}),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should skip compensated transactions', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([operation([transaction({ compensates: 'other-transaction-id' })])])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should skip transactions with unknown asset ids', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ asset_id: 'unknown-uuid', transaction_id: 'tx-x' })]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should skip unknown transaction types without throwing', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ transaction_type: 'mystery_type', transaction_id: 'tx-m' })]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should fetch all pages via top-level next_cursor', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([operation([transaction({ transaction_id: 'tx-page-1' })])], {
				nextCursor: 'cursor-2',
			})
			mockOperationsPage('cursor-2', [operation([transaction({ transaction_id: 'tx-page-2' })])])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(2)
			expect(result.transactions.map((t) => t.externalId).sort()).toEqual([
				'tx-page-1',
				'tx-page-2',
			])
		})

		it('should URL-encode cursors when paginating', async () => {
			const trickyCursor = 'c&1'
			mockAssets([BTC_ASSET])
			mockOperations([operation([transaction({ transaction_id: 'tx-enc-1' })])], {
				nextCursor: trickyCursor,
			})
			mockOperationsPage(trickyCursor, [operation([transaction({ transaction_id: 'tx-enc-2' })])])

			const fetchSpy = vi.spyOn(globalThis, 'fetch')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(2)
				expect(result.transactions.map((t) => t.externalId).sort()).toEqual([
					'tx-enc-1',
					'tx-enc-2',
				])
				const operationUrls = fetchSpy.mock.calls
					.map((call) => String(call[0]))
					.filter((url) => url.includes('/operations'))
				expect(operationUrls.some((url) => url.includes(`cursor=c%261`))).toBe(true)
			} finally {
				fetchSpy.mockRestore()
			}
		})

		it('should follow a cursor even when has_next_page is false, with a warning', async () => {
			mockAssets([BTC_ASSET])
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 100 })
				.reply(200, {
					data: [operation([transaction({ transaction_id: 'tx-disagree-1' })])],
					self_cursor: null,
					next_cursor: 'cursor-follow',
					has_next_page: false,
				})
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 100, cursor: 'cursor-follow' })
				.reply(200, {
					data: [operation([transaction({ transaction_id: 'tx-disagree-2' })])],
					self_cursor: 'cursor-follow',
					next_cursor: null,
					has_next_page: false,
				})

			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions.map((t) => t.externalId).sort()).toEqual([
					'tx-disagree-1',
					'tx-disagree-2',
				])
				expect(warnSpy).toHaveBeenCalledWith(
					expect.objectContaining({ cursor: 'cursor-follow' }),
					expect.stringContaining('following cursor anyway')
				)
			} finally {
				warnSpy.mockRestore()
			}
		})

		it('should skip BCPEUR (EUR-pegged Bitpanda token) trades', async () => {
			const bcpAssetId = 'bcp-uuid-9'
			mockAssets([BTC_ASSET, { id: bcpAssetId, symbol: 'BCPEUR' }])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-bcp',
						asset_id: bcpAssetId,
						asset_amount: { value: '5000', asset_id: bcpAssetId, currency_id: null },
						transaction_type: 'buy',
						trade: { rate: '1', to_eur_rate: '1', fee: null },
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should fetch all pages when next_cursor is nested under meta (legacy shape)', async () => {
			mockAssets([BTC_ASSET])
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 100 })
				.reply(200, {
					data: [operation([transaction({ transaction_id: 'tx-meta-1' })])],
					meta: { next_cursor: 'meta-cursor-2' },
				})
			mockOperationsPage('meta-cursor-2', [
				operation([transaction({ transaction_id: 'tx-meta-2' })]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(2)
		})

		it('should sort transactions by timestamp descending', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({ transaction_id: 'tx-old', credited_at: '2024-01-10T10:00:00+01:00' }),
					transaction({ transaction_id: 'tx-new', credited_at: '2024-01-20T10:00:00+01:00' }),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions[0].externalId).toBe('tx-new')
			expect(result.transactions[1].externalId).toBe('tx-old')
		})

		it('should support assets responses with flat symbol field', async () => {
			nock(PUBLIC_API_BASE)
				.get('/assets')
				.query({ page_size: 100 })
				.reply(200, { data: [{ id: BTC_ASSET_ID, symbol: 'BTC' }] })
			mockOperations([operation([transaction()])])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(1)
			expect(result.transactions[0].asset).toBe('BTC')
		})

		it('should throw on API failure', async () => {
			mockOperations([])
			nock(PUBLIC_API_BASE)
				.get('/assets')
				.query({ page_size: 100 })
				.reply(401, { error: 'Unauthorized' })

			await expect(client.fetchTransactions(API_KEY)).rejects.toThrow('Failed to fetch assets: 401')
		})

		it('should skip transactions with an invalid credited_at', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([operation([transaction({ credited_at: 'not-a-date' })])])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(0)
		})

		it('should abort when has_next_page is true but no cursor is returned', async () => {
			mockAssets([BTC_ASSET])
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 100 })
				.reply(200, {
					data: [operation([transaction({ transaction_id: 'tx-truncated' })])],
					next_cursor: null,
					has_next_page: true,
				})

			await expect(client.fetchTransactions(API_KEY)).rejects.toThrow(/has_next_page/)
		})

		it('should throw on unexpected response shape', async () => {
			mockAssets([BTC_ASSET])
			nock(PUBLIC_API_BASE)
				.get('/operations')
				.query({ page_size: 100 })
				.reply(200, { error: 'something went wrong' })

			await expect(client.fetchTransactions(API_KEY)).rejects.toThrow(/Unexpected response shape/)
		})

		it('should log a skip tally for skipped transactions', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ compensates: 'other-tx', transaction_id: 'tx-comp' })]),
				operation([transaction({ transaction_type: 'mystery_type', transaction_id: 'tx-m' })]),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				await client.fetchTransactions(API_KEY)

				const tallyCalls = infoSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCalls).toHaveLength(1)
				expect(tallyCalls[0][0]).toMatchObject({
					skipCounts: { compensated: 1, unknownTransactionType: 1 },
				})
				const unknownTypeWarn = warnSpy.mock.calls.filter((args) =>
					args.some(
						(arg) =>
							typeof arg === 'string' && arg.includes('Unknown transaction types were skipped')
					)
				)
				expect(unknownTypeWarn).toHaveLength(1)
			} finally {
				infoSpy.mockRestore()
				warnSpy.mockRestore()
			}
		})

		it('should log degraded imports separately from skips', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ trade: { rate: '', to_eur_rate: '', fee: null } })]),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(1)
				const tallyCalls = infoSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCalls).toHaveLength(0)
				const degradedWarn = warnSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'degradedCounts' in (arg as object)
				)
				expect(degradedWarn).toHaveLength(1)
				expect(degradedWarn[0][0]).toMatchObject({
					degradedCounts: { unparseableTradeNumbers: 1 },
				})
				expect(degradedWarn[0][1]).toContain(
					'Degraded transactions imported (see degradedCounts for reasons)'
				)
			} finally {
				infoSpy.mockRestore()
				warnSpy.mockRestore()
			}
		})

		it('should deduplicate transactions by id across operations', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction()], { operation_id: 'op-1' }),
				operation([transaction()], { operation_id: 'op-2' }),
				operation([transaction()], { operation_id: 'op-3' }),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(1)
				const tallyCalls = infoSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCalls).toHaveLength(1)
				expect(tallyCalls[0][0]).toMatchObject({ skipCounts: { duplicateTransactionId: 2 } })
				const duplicateWarn = warnSpy.mock.calls.filter(
					([arg, message]) =>
						typeof arg === 'object' &&
						arg !== null &&
						'count' in (arg as object) &&
						typeof message === 'string' &&
						message.includes('Duplicate transaction ids')
				)
				expect(duplicateWarn).toHaveLength(1)
			} finally {
				infoSpy.mockRestore()
				warnSpy.mockRestore()
			}
		})

		it('should log skips and degraded imports in separate tallies', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([
					transaction({ transaction_id: 'tx-skipped', compensates: 'other-tx' }),
					transaction({
						transaction_id: 'tx-degraded',
						trade: { rate: '', to_eur_rate: '', fee: null },
					}),
				]),
			])

			const infoSpy = vi.spyOn(logger, 'info')
			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(1)
				const tallyCalls = infoSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'skipCounts' in (arg as object)
				)
				expect(tallyCalls).toHaveLength(1)
				expect(tallyCalls[0][0]).toMatchObject({ skipCounts: { compensated: 1 } })
				const degradedWarn = warnSpy.mock.calls.filter(
					([arg]) => typeof arg === 'object' && arg !== null && 'degradedCounts' in (arg as object)
				)
				expect(degradedWarn).toHaveLength(1)
				expect(degradedWarn[0][0]).toMatchObject({
					degradedCounts: { unparseableTradeNumbers: 1 },
				})
				expect(degradedWarn[0][1]).toContain(
					'Degraded transactions imported (see degradedCounts for reasons)'
				)
			} finally {
				infoSpy.mockRestore()
				warnSpy.mockRestore()
			}
		})

		it('should warn when trade numbers are unparseable', async () => {
			mockAssets([BTC_ASSET])
			mockOperations([
				operation([transaction({ trade: { rate: '', to_eur_rate: '', fee: null } })]),
			])

			const warnSpy = vi.spyOn(logger, 'warn')
			try {
				const result = await client.fetchTransactions(API_KEY)

				expect(result.transactions).toHaveLength(1)
				expect(warnSpy).toHaveBeenCalledWith(
					expect.objectContaining({ transactionId: 'tx-1' }),
					expect.any(String)
				)
			} finally {
				warnSpy.mockRestore()
			}
		})

		it('should keep only the largest fee when no buy leg carries a fee', async () => {
			mockAssets([BTC_ASSET, ETH_ASSET])
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-sell-1',
						asset_id: ETH_ASSET_ID,
						asset_amount: { value: '-0.6', asset_id: ETH_ASSET_ID, currency_id: null },
						transaction_type: 'sell',
						flow: 'OUTGOING',
						trade: { rate: '1666.66', to_eur_rate: '1', fee: { value: '4.40' } },
					}),
					transaction({
						transaction_id: 'tx-sell-2',
						asset_id: BTC_ASSET_ID,
						asset_amount: { value: '-0.05', asset_id: BTC_ASSET_ID, currency_id: null },
						transaction_type: 'sell',
						flow: 'OUTGOING',
						trade: { rate: '20000', to_eur_rate: '1', fee: { value: '9.90' } },
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			const sell1 = result.transactions.find((t) => t.externalId === 'tx-sell-1')
			const sell2 = result.transactions.find((t) => t.externalId === 'tx-sell-2')
			expect(sell1?.eurFee).toBe(0)
			expect(sell2?.eurFee).toBe(9.9)
		})

		it('should resolve symbols across multiple asset pages', async () => {
			nock(PUBLIC_API_BASE)
				.get('/assets')
				.query({ page_size: 100 })
				.reply(200, {
					data: [{ id: BTC_ASSET_ID, attributes: { symbol: 'BTC' } }],
					next_cursor: 'asset-cursor-2',
					has_next_page: true,
				})
			nock(PUBLIC_API_BASE)
				.get('/assets')
				.query({ page_size: 100, cursor: 'asset-cursor-2' })
				.reply(200, {
					data: [{ id: ETH_ASSET_ID, attributes: { symbol: 'ETH' } }],
					next_cursor: null,
					has_next_page: false,
				})
			mockOperations([
				operation([
					transaction({
						transaction_id: 'tx-eth',
						asset_id: ETH_ASSET_ID,
						transaction_type: 'reward',
					}),
				]),
			])

			const result = await client.fetchTransactions(API_KEY)

			expect(result.transactions).toHaveLength(1)
			expect(result.transactions[0].asset).toBe('ETH')
		})
	})

	describe('fetchBalances', () => {
		function mockPortfolio(items: unknown[], options: { nextCursor?: string } = {}) {
			nock(PUBLIC_API_BASE)
				.get('/portfolio')
				.query({ page_size: 100 })
				.reply(200, {
					data: items,
					next_cursor: options.nextCursor ?? null,
					has_next_page: !!options.nextCursor,
				})
		}

		function mockPortfolioPage(cursor: string, items: unknown[]) {
			nock(PUBLIC_API_BASE).get('/portfolio').query({ page_size: 100, cursor }).reply(200, {
				data: items,
				next_cursor: null,
				has_next_page: false,
			})
		}

		function portfolioRow(overrides: Record<string, unknown> = {}) {
			return {
				asset_id: BTC_ASSET_ID,
				currency_id: null,
				balance: { value: '1.5', asset_id: BTC_ASSET_ID, currency_id: null },
				...overrides,
			}
		}

		it('should resolve crypto portfolio balances to asset symbols', async () => {
			mockAssets([BTC_ASSET, ETH_ASSET])
			mockPortfolio([
				portfolioRow(),
				portfolioRow({
					asset_id: ETH_ASSET_ID,
					balance: { value: '0.25', asset_id: ETH_ASSET_ID, currency_id: null },
				}),
				// Fiat/goods rows have ids not present in the /assets catalog and
				// are deliberately skipped.
				portfolioRow({ asset_id: 'fiat-eur-uuid' }),
			])

			const balances = await client.fetchBalances(API_KEY)

			expect(balances).toEqual([
				{ asset: 'BTC', quantity: 1.5 },
				{ asset: 'ETH', quantity: 0.25 },
			])
		})

		it('should sum duplicate wallet rows and skip unparsable balances', async () => {
			mockAssets([BTC_ASSET])
			mockPortfolio(
				[
					portfolioRow({ balance: { value: '1.0', asset_id: BTC_ASSET_ID, currency_id: null } }),
					portfolioRow({ balance: { value: 'not-a-number' } }),
					portfolioRow({ balance: null }),
				],
				{ nextCursor: 'portfolio-cursor-2' }
			)
			mockPortfolioPage('portfolio-cursor-2', [
				portfolioRow({ balance: { value: '0.125', asset_id: BTC_ASSET_ID, currency_id: null } }),
			])

			const balances = await client.fetchBalances(API_KEY)

			expect(balances).toEqual([{ asset: 'BTC', quantity: 1.125 }])
		})

		it('should exclude BCPEUR from reconciliation balances', async () => {
			const BCPEUR_ASSET_ID = 'bcpeur-uuid'
			mockAssets([BTC_ASSET, { id: BCPEUR_ASSET_ID, symbol: 'BCPEUR' }])
			mockPortfolio([
				portfolioRow({ balance: { value: '500', asset_id: BTC_ASSET_ID, currency_id: null } }),
				portfolioRow({ asset_id: BCPEUR_ASSET_ID, balance: { value: '1000' } }),
			])

			const balances = await client.fetchBalances(API_KEY)

			expect(balances).toEqual([{ asset: 'BTC', quantity: 500 }])
		})

		it('should throw on a failed portfolio fetch', async () => {
			mockAssets([BTC_ASSET])
			nock(PUBLIC_API_BASE)
				.get('/portfolio')
				.query({ page_size: 100 })
				.reply(401, { error: 'unauthorized' })

			await expect(client.fetchBalances(API_KEY)).rejects.toThrow(/Failed to fetch portfolio/)
		})
	})
})
