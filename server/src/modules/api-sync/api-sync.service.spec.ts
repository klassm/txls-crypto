import { ProviderType, TransactionType } from '@txls/shared'
import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../common/logger.js'
import { getProviderConfig } from '../../providers/registry.js'
import { broadcastSyncEvent } from '../../websocket.js'
import { ApiSyncService } from './api-sync.service.js'

vi.mock('../../websocket.js', () => ({
	broadcastSyncEvent: vi.fn(),
}))

vi.mock('../../providers/registry.js', () => ({
	getProviderConfig: vi.fn(() => ({
		apiClient: {
			fetchTransactions: vi.fn(),
			testConnection: vi.fn(),
		},
	})),
}))

vi.mock('./encryption.service.js', () => ({
	decrypt: vi.fn((key) => key),
}))

describe('ApiSyncService', () => {
	let service: ApiSyncService
	let mockAccountsRepo: any
	let mockTransactionsRepo: any
	let mockTransactionsService: any
	let mockHoldingsService: any
	let mockPriceBackfillService: any
	let mockTransferMatchingService: any
	let mockPricesService: any
	let mockCoinGeckoService: any
	let mockDataSource: any

	beforeEach(async () => {
		vi.clearAllMocks()

		mockAccountsRepo = {
			findById: vi.fn(),
			save: vi.fn(),
			findEnabledApiSyncAccounts: vi.fn().mockResolvedValue([]),
			updateSyncSuccess: vi.fn().mockResolvedValue(undefined),
			updateSyncError: vi.fn().mockResolvedValue(undefined),
		}

		mockTransactionsRepo = {
			findByProviderAccountId: vi.fn().mockResolvedValue([]),
			save: vi.fn(),
			saveMany: vi.fn().mockImplementation(async (entities: any[]) => entities),
			findManyByExternalIds: vi.fn().mockResolvedValue([]),
			findManyByExternalIdsIn: vi.fn().mockResolvedValue([]),
			deleteByAccountFromTimestamp: vi.fn().mockResolvedValue(0),
		}

		mockDataSource = {
			transaction: vi.fn(async (cb: any) => cb({})),
		}

		mockTransactionsService = {
			importTransactions: vi.fn(),
		}

		mockHoldingsService = {
			rebuildHoldingsFromTimestamp: vi.fn(),
		}

		mockPriceBackfillService = {
			storePricesFromTransactions: vi.fn(),
		}

		mockTransferMatchingService = {
			matchTransfersForUser: vi.fn(),
		}

		mockPricesService = {
			getPriceForDate: vi.fn().mockResolvedValue(null),
			savePrices: vi.fn().mockResolvedValue(undefined),
		}

		mockCoinGeckoService = {
			fetchHistoricalDailyPrices: vi.fn().mockResolvedValue([]),
		}

		service = new ApiSyncService(
			mockAccountsRepo as any,
			mockTransactionsRepo as any,
			mockTransactionsService as any,
			mockHoldingsService as any,
			mockPriceBackfillService as any,
			mockTransferMatchingService as any,
			mockPricesService as any,
			mockDataSource as any,
			mockCoinGeckoService as any
		)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('validateApiKey', () => {
		it('should return valid for working API key', async () => {
			const { getProviderConfig } = await import('../../providers/registry.js')
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient: {
					testConnection: vi.fn().mockResolvedValue(true),
				},
			} as any)

			const result = await service.validateApiKey('bitpanda', 'test-key')

			expect(result.valid).toBe(true)
		})

		it('should return invalid for non-working API key', async () => {
			const { getProviderConfig } = await import('../../providers/registry.js')
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient: {
					testConnection: vi.fn().mockResolvedValue(false),
				},
			} as any)

			const result = await service.validateApiKey('bitpanda', 'invalid-key')

			expect(result.valid).toBe(false)
			expect(result.error).toBe('Invalid API key')
		})

		it('should return the error message when testConnection throws', async () => {
			const { getProviderConfig } = await import('../../providers/registry.js')
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient: {
					testConnection: vi.fn().mockRejectedValue(new Error('connection refused')),
				},
			} as any)

			const result = await service.validateApiKey('bitpanda', 'test-key')

			expect(result.valid).toBe(false)
			expect(result.error).toBe('connection refused')
		})

		it('should return error when provider does not support API sync', async () => {
			const { getProviderConfig } = await import('../../providers/registry.js')
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient: undefined,
			} as any)

			const result = await service.validateApiKey('traderepublic', 'test-key')

			expect(result.valid).toBe(false)
			expect(result.error).toBe('Provider does not support API sync')
		})
	})

	describe('isSyncing', () => {
		it('should return false when not syncing', () => {
			expect(service.isSyncing(1, 1)).toBe(false)
		})
	})

	describe('syncAccount', () => {
		async function setupFullSync(savedTransactions: any[]) {
			mockAccountsRepo.findById.mockResolvedValue({
				id: 1,
				userId: 1,
				provider: ProviderType.Bitpanda,
				apiEnabled: true,
				apiKeyEncrypted: 'test-key',
			})
			const { getProviderConfig } = await import('../../providers/registry.js')
			const apiClient: {
				fetchTransactions: ReturnType<typeof vi.fn>
				testConnection: ReturnType<typeof vi.fn>
				fetchBalances?: ReturnType<typeof vi.fn>
			} = {
				fetchTransactions: vi.fn().mockResolvedValue({
					transactions: savedTransactions.map((t) => ({ ...t })),
				}),
				testConnection: vi.fn(),
			}
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient,
			} as any)
			mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })
			mockTransactionsRepo.findManyByExternalIds.mockResolvedValue(savedTransactions)
			return apiClient
		}

		const makeTx = (overrides: Record<string, unknown> = {}) => ({
			id: 1,
			userId: 1,
			providerAccountId: 1,
			externalId: 'tx-buy',
			type: TransactionType.buy,
			asset: 'ETH',
			quantity: 0.5,
			eurValue: 1000,
			eurFee: 1,
			eurRate: 2000,
			timestamp: DateTime.fromISO('2024-06-10T10:00:00Z', { zone: 'utc' }),
			...overrides,
		})

		const makeReward = (id: number, externalId: string) =>
			makeTx({
				id,
				externalId,
				type: TransactionType.reward,
				quantity: 0.01,
				eurValue: 0,
				eurFee: 0,
				eurRate: 0,
				timestamp: DateTime.fromISO('2024-06-15T10:00:00Z', { zone: 'utc' }),
			})

		it('should skip when already syncing', async () => {
			mockAccountsRepo.findById.mockResolvedValue({
				id: 1,
				userId: 1,
				provider: ProviderType.Bitpanda,
				apiEnabled: true,
				apiKeyEncrypted: 'test-key',
			})

			const firstSync = service.syncAccount(1, 1)
			const secondSync = service.syncAccount(1, 1)

			const [_first, second] = await Promise.all([firstSync, secondSync])

			expect(second.success).toBe(false)
			expect(second.error).toBe('Already syncing')
		})

		it('should skip when another account of the same user is syncing', async () => {
			mockAccountsRepo.findById.mockImplementation((_userId: number, accountId: number) =>
				Promise.resolve({
					id: accountId,
					userId: 1,
					provider: ProviderType.Bitpanda,
					apiEnabled: true,
					apiKeyEncrypted: 'test-key',
				})
			)
			const { getProviderConfig } = await import('../../providers/registry.js')
			let releaseFirst: (() => void) | undefined
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient: {
					fetchTransactions: vi.fn().mockReturnValue(
						new Promise<void>((resolve) => {
							releaseFirst = resolve
						}).then(() => ({ transactions: [] }))
					),
					testConnection: vi.fn(),
				},
			} as any)

			const firstSync = service.syncAccount(1, 1)
			const secondSync = service.syncAccount(2, 1)

			const second = await secondSync
			expect(second.success).toBe(false)
			expect(second.error).toBe('User already syncing')
			expect(service.isSyncing(2, 1)).toBe(true)

			releaseFirst?.()
			await firstSync
			expect(service.isSyncing(2, 1)).toBe(false)
		})

		it('should return error when account not found', async () => {
			mockAccountsRepo.findById.mockResolvedValue(null)

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Account not found')
		})

		it('should not write a sync error or broadcast when the account does not belong to the user', async () => {
			mockAccountsRepo.findById.mockResolvedValue(null)

			await service.syncAccount(1, 1)

			expect(mockAccountsRepo.updateSyncError).not.toHaveBeenCalled()
			expect(broadcastSyncEvent).not.toHaveBeenCalled()
		})

		it('should fail the sync when the import reports row errors inside the replace transaction', async () => {
			const buy = makeTx()
			await setupFullSync([buy])
			mockTransactionsService.importTransactions.mockResolvedValue({
				imported: 2,
				errors: ['Constraint violation on row 5'],
			})

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(false)
			expect(result.error).toContain('row errors')
			// Raw driver error text must never reach the user-facing syncError.
			expect(result.error).not.toContain('Constraint violation on row 5')
			expect(mockAccountsRepo.updateSyncError).toHaveBeenCalled()
			const completeEvents = vi
				.mocked(broadcastSyncEvent)
				.mock.calls.filter(([, , event]) => event === 'sync-complete')
			expect(completeEvents).toHaveLength(0)
		})

		it('should skip transactions whose external id already exists in another account of the user', async () => {
			const buy = makeTx()
			const reward = makeReward(2, 'tx-reward-1')
			await setupFullSync([buy, reward])
			// First lookup (inside the replace transaction): tx-buy still exists
			// for this user (e.g. imported via CSV into another account).
			mockTransactionsRepo.findManyByExternalIdsIn.mockResolvedValueOnce([buy])

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(true)
			expect(mockTransactionsService.importTransactions).toHaveBeenCalledWith(
				1,
				1,
				[expect.objectContaining({ externalId: 'tx-reward-1' })],
				expect.anything()
			)
			// The dedupe lookup must run inside the transaction, after the delete.
			const deleteOrder = mockTransactionsRepo.deleteByAccountFromTimestamp.mock.invocationCallOrder[0]
			const lookupOrder = mockTransactionsRepo.findManyByExternalIdsIn.mock.invocationCallOrder[0]
			expect(lookupOrder).toBeGreaterThan(deleteOrder)
			// The post-import pipeline sees only the imported subset.
			expect(mockTransactionsRepo.findManyByExternalIds).toHaveBeenCalledWith(1, ['tx-reward-1'])
		})

		it('should still rebuild holdings when every fetched transaction exists in another account', async () => {
			await setupFullSync([makeTx()])
			mockTransactionsRepo.deleteByAccountFromTimestamp.mockResolvedValue(5)
			mockTransactionsRepo.findManyByExternalIdsIn.mockResolvedValue([makeTx()])
			// Nothing was imported, so nothing can be saved for the pipeline.
			mockTransactionsRepo.findManyByExternalIds.mockResolvedValue([])
			mockTransactionsService.importTransactions.mockImplementation(
				async (_userId: number, _accountId: number, transactions: any[]) => ({
					imported: transactions.length,
					errors: [],
				})
			)

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(true)
			expect(result.imported).toBe(0)
			expect(mockTransferMatchingService.matchTransfersForUser).toHaveBeenCalledWith(1)
			expect(mockHoldingsService.rebuildHoldingsFromTimestamp).toHaveBeenCalled()
			// No saved rows → no price seeding or reward valuation.
			expect(mockPriceBackfillService.storePricesFromTransactions).not.toHaveBeenCalled()
		})

		it('should delete existing transactions before importing inside the replace transaction', async () => {
			const buy = makeTx()
			await setupFullSync([buy])
			// Distinct token to prove the em handed out by the transaction
			// callback is the one both replacements operate through.
			const emToken = { em: 'replace-tx' }
			mockDataSource.transaction.mockImplementation(async (cb: (em: unknown) => unknown) =>
				cb(emToken)
			)

			await service.syncAccount(1, 1)

			expect(mockTransactionsRepo.deleteByAccountFromTimestamp).toHaveBeenCalled()
			expect(mockTransactionsService.importTransactions).toHaveBeenCalled()
			expect(
				mockTransactionsRepo.deleteByAccountFromTimestamp.mock.invocationCallOrder[0]
			).toBeLessThan(mockTransactionsService.importTransactions.mock.invocationCallOrder[0])
			expect(mockTransactionsRepo.deleteByAccountFromTimestamp).toHaveBeenCalledWith(
				1,
				1,
				DateTime.fromISO('2024-06-10T10:00:00Z', { zone: 'utc' }).toMillis(),
				emToken
			)
			expect(mockTransactionsService.importTransactions).toHaveBeenCalledWith(
				1,
				1,
				expect.anything(),
				emToken
			)
		})

		it('should record a sync error when a post-import pipeline stage fails', async () => {
			const buy = makeTx()
			await setupFullSync([buy])
			mockPriceBackfillService.storePricesFromTransactions.mockRejectedValue(
				new Error('price DB down')
			)

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(false)
			expect(mockAccountsRepo.updateSyncError).toHaveBeenCalled()
			const completeEvents = vi
				.mocked(broadcastSyncEvent)
				.mock.calls.filter(([, , event]) => event === 'sync-complete')
			expect(completeEvents).toHaveLength(0)
		})

		it('should sanitize database errors in the user-facing sync error', async () => {
			await setupFullSync([makeTx()])
			const { QueryFailedError } = await import('typeorm')
			mockPriceBackfillService.storePricesFromTransactions.mockRejectedValue(
				new QueryFailedError(
					'INSERT INTO transactions ...',
					[],
					new Error('Duplicate entry for key uk_external_id')
				)
			)

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(false)
			expect(result.error).not.toContain('INSERT INTO')
			expect(result.error).not.toContain('uk_external_id')
			expect(mockAccountsRepo.updateSyncError).toHaveBeenCalledWith(
				1,
				'Database error during sync — see server logs'
			)
		})

		it('should return error when API sync not enabled', async () => {
			mockAccountsRepo.findById.mockResolvedValue({
				id: 1,
				userId: 1,
				provider: ProviderType.Bitpanda,
				apiEnabled: false,
				apiKeyEncrypted: null,
			})

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(false)
			expect(result.error).toBe('API sync not enabled for this account')
			// The account is verified for this user, so the started event pairs
			// with the sync-error broadcast in the catch path.
			const startedEvents = vi
				.mocked(broadcastSyncEvent)
				.mock.calls.filter(([, , event]) => event === 'sync-started')
			expect(startedEvents).toHaveLength(1)
		})

		it('should value rewards with zero EUR value from stored daily prices', async () => {
			const reward = {
				id: 2,
				userId: 1,
				providerAccountId: 1,
				externalId: 'tx-reward',
				type: TransactionType.reward,
				asset: 'ETH',
				quantity: 0.02,
				eurValue: 0,
				eurFee: 0,
				eurRate: 0,
				timestamp: DateTime.fromISO('2024-06-15T10:00:00Z', { zone: 'utc' }),
			}
			const buy = makeTx()
			await setupFullSync([buy, reward])
			mockPricesService.getPriceForDate.mockResolvedValue({
				asset: 'ETH',
				priceEur: 3000,
				fetchedAt: reward.timestamp,
				source: 'test',
			})

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(true)
			const savedEntities = mockTransactionsRepo.saveMany.mock.calls[0][0]
			const savedReward = savedEntities.find((t: any) => t.externalId === 'tx-reward')
			expect(savedReward.eurValue).toBe(60)
			expect(savedReward.eurRate).toBe(3000)
			const savedBuy = savedEntities.find((t: any) => t.externalId === 'tx-buy')
			expect(savedBuy).toBeUndefined()
			expect(mockPricesService.getPriceForDate).toHaveBeenCalledWith('ETH', reward.timestamp)
		})

		it('should leave rewards untouched when no stored price exists for the date', async () => {
			const reward = {
				id: 2,
				userId: 1,
				providerAccountId: 1,
				externalId: 'tx-reward',
				type: TransactionType.reward,
				asset: 'XYZ',
				quantity: 1,
				eurValue: 0,
				eurFee: 0,
				eurRate: 0,
				timestamp: DateTime.fromISO('2024-06-15T10:00:00Z', { zone: 'utc' }),
			}
			await setupFullSync([reward])
			mockPricesService.getPriceForDate.mockResolvedValue(null)

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(true)
			expect(mockTransactionsRepo.saveMany).not.toHaveBeenCalled()
		})

		it('should not touch rewards that already have a EUR value', async () => {
			const reward = {
				id: 2,
				userId: 1,
				providerAccountId: 1,
				externalId: 'tx-reward',
				type: TransactionType.reward,
				asset: 'ETH',
				quantity: 0.02,
				eurValue: 55,
				eurFee: 0,
				eurRate: 2750,
				timestamp: DateTime.fromISO('2024-06-15T10:00:00Z', { zone: 'utc' }),
			}
			await setupFullSync([reward])
			mockPricesService.getPriceForDate.mockResolvedValue({
				asset: 'ETH',
				priceEur: 3000,
				fetchedAt: reward.timestamp,
				source: 'test',
			})

			await service.syncAccount(1, 1)

			expect(mockTransactionsRepo.saveMany).not.toHaveBeenCalled()
			expect(mockPricesService.getPriceForDate).not.toHaveBeenCalled()
		})

		it('should look up each asset-day price only once across rewards', async () => {
			await setupFullSync([makeReward(2, 'tx-reward-1'), makeReward(3, 'tx-reward-2')])
			mockPricesService.getPriceForDate.mockResolvedValue({
				asset: 'ETH',
				priceEur: 3000,
				fetchedAt: DateTime.fromISO('2024-06-15T00:00:00Z', { zone: 'utc' }),
				source: 'test',
			})

			await service.syncAccount(1, 1)

			expect(mockPricesService.getPriceForDate).toHaveBeenCalledTimes(1)
			const savedEntities = mockTransactionsRepo.saveMany.mock.calls[0][0]
			expect(savedEntities).toHaveLength(2)
			for (const saved of savedEntities) {
				expect(saved.eurValue).toBe(30)
			}
		})

		it('should value rewards via the CoinGecko fallback when no stored price exists', async () => {
			const reward = makeReward(2, 'tx-reward-1')
			await setupFullSync([reward])
			mockPricesService.getPriceForDate
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({
					asset: 'ETH',
					priceEur: 3000,
					fetchedAt: reward.timestamp,
					source: 'coingecko',
				})
			mockCoinGeckoService.fetchHistoricalDailyPrices.mockResolvedValue([
				{
					symbol: 'ETH',
					priceEur: 3000,
					fetchedAt: DateTime.fromISO('2024-06-15T00:00:00Z', { zone: 'utc' }),
				},
			])

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(true)
			expect(mockCoinGeckoService.fetchHistoricalDailyPrices).toHaveBeenCalledWith(
				'ETH',
				expect.any(Number)
			)
			expect(mockPricesService.savePrices).toHaveBeenCalledWith([
				{
					symbol: 'ETH',
					priceEur: 3000,
					fetchedAt: DateTime.fromISO('2024-06-15T00:00:00Z', { zone: 'utc' }),
				},
			])
			const savedEntities = mockTransactionsRepo.saveMany.mock.calls[0][0]
			const savedReward = savedEntities.find((t: any) => t.externalId === 'tx-reward-1')
			expect(savedReward.eurValue).toBeCloseTo(30)
			expect(savedReward.eurRate).toBe(3000)
		})

		it('should keep rewards unvalued when the CoinGecko fallback fails', async () => {
			const reward = makeReward(2, 'tx-reward-1')
			await setupFullSync([reward])
			mockPricesService.getPriceForDate.mockResolvedValue(null)
			mockCoinGeckoService.fetchHistoricalDailyPrices.mockRejectedValue(
				new Error('CoinGecko down')
			)

			const result = await service.syncAccount(1, 1)

			expect(result.success).toBe(true)
			expect(mockTransactionsRepo.saveMany).not.toHaveBeenCalled()
		})

		it('should survive a failing error handler and keep syncing other accounts', async () => {
			mockAccountsRepo.findEnabledApiSyncAccounts.mockResolvedValue([
				{ id: 1, userId: 1, provider: ProviderType.Bitpanda },
				{ id: 2, userId: 1, provider: ProviderType.Bitpanda },
			])
			mockAccountsRepo.findById.mockImplementation((_userId: number, id: number) =>
				Promise.resolve({
					id,
					userId: 1,
					provider: ProviderType.Bitpanda,
					apiEnabled: true,
					apiKeyEncrypted: 'enc-key',
				})
			)
			const failingClient = {
				fetchTransactions: vi.fn().mockRejectedValue(new Error('API down')),
				testConnection: vi.fn(),
			}
			vi.mocked(getProviderConfig).mockReturnValue({
				apiClient: failingClient,
			} as any)
			mockAccountsRepo.updateSyncError.mockRejectedValue(new Error('DB down too'))

			const results = await service.syncAllAccounts()

			expect(results).toHaveLength(2)
			expect(results[0].success).toBe(false)
			expect(results[0].error).toBe('API down')
			// The terminal event must fire even when recording the error state failed.
			const errorEvents = vi
				.mocked(broadcastSyncEvent)
				.mock.calls.filter(([, , event]) => event === 'sync-error')
			expect(errorEvents).toHaveLength(2)
		})

		describe('balance reconciliation', () => {
			it('should compare holdings against provider balances and warn on drift', async () => {
				const apiClient = await setupFullSync([makeTx()])
				apiClient.fetchBalances = vi.fn().mockResolvedValue([{ asset: 'ETH', quantity: 1.5 }])
				mockHoldingsService.getCurrentHoldings = vi
					.fn()
					.mockResolvedValue([{ asset: 'ETH', amount: 1.0, eurInvested: 100, buys: 1, sells: 0 }])
				mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })

				const warnSpy = vi.spyOn(logger, 'warn')
				try {
					const result = await service.syncAccount(1, 1)

					expect(apiClient.fetchBalances).toHaveBeenCalledWith('test-key')
					// Reconciliation must never fail the sync.
					expect(result.success).toBe(true)
					expect(result.imported).toBe(1)
					const driftWarns = warnSpy.mock.calls.filter((args) =>
						args.some((arg) => typeof arg === 'string' && arg.includes('reconciliation drift'))
					)
					expect(driftWarns).toHaveLength(1)
					expect(driftWarns[0][0]).toMatchObject({
						count: 1,
						drift: [{ asset: 'ETH', app: 1.0, provider: 1.5 }],
					})
				} finally {
					warnSpy.mockRestore()
				}
			})

			it('should warn on drift when an asset is missing on the provider side', async () => {
				const apiClient = await setupFullSync([makeTx()])
				apiClient.fetchBalances = vi.fn().mockResolvedValue([])
				mockHoldingsService.getCurrentHoldings = vi
					.fn()
					.mockResolvedValue([{ asset: 'ETH', amount: 1.0, eurInvested: 100, buys: 1, sells: 0 }])
				mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })

				const warnSpy = vi.spyOn(logger, 'warn')
				try {
					await service.syncAccount(1, 1)

					const driftWarns = warnSpy.mock.calls.filter((args) =>
						args.some((arg) => typeof arg === 'string' && arg.includes('reconciliation drift'))
					)
					expect(driftWarns).toHaveLength(1)
					expect(driftWarns[0][0]).toMatchObject({
						drift: [{ asset: 'ETH', app: 1.0, provider: 0 }],
					})
				} finally {
					warnSpy.mockRestore()
				}
			})

			it('should stay silent for drift within the tolerance', async () => {
				const apiClient = await setupFullSync([makeTx()])
				apiClient.fetchBalances = vi
					.fn()
					.mockResolvedValue([{ asset: 'ETH', quantity: 1.0000000005 }])
				mockHoldingsService.getCurrentHoldings = vi
					.fn()
					.mockResolvedValue([{ asset: 'ETH', amount: 1.0, eurInvested: 100, buys: 1, sells: 0 }])
				mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })

				const warnSpy = vi.spyOn(logger, 'warn')
				try {
					await service.syncAccount(1, 1)

					const driftWarns = warnSpy.mock.calls.filter((args) =>
						args.some((arg) => typeof arg === 'string' && arg.includes('reconciliation drift'))
					)
					expect(driftWarns).toHaveLength(0)
				} finally {
					warnSpy.mockRestore()
				}
			})

			it('should keep a completed sync successful when the complete broadcast throws', async () => {
				await setupFullSync([makeTx()])
				mockHoldingsService.getCurrentHoldings = vi.fn().mockResolvedValue([])
				mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })
				vi.mocked(broadcastSyncEvent).mockImplementation((_userId, _accountId, event) => {
					if (event === 'sync-complete') {
						throw new Error('socket down')
					}
				})
				const errorSpy = vi.spyOn(logger, 'error')
				try {
					const result = await service.syncAccount(1, 1)

					expect(result.success).toBe(true)
					expect(result.imported).toBe(1)
					expect(mockAccountsRepo.updateSyncError).not.toHaveBeenCalled()
					expect(
						errorSpy.mock.calls.some((args) =>
							args.some(
								(arg) =>
									typeof arg === 'string' && arg.includes('Failed to broadcast sync complete')
							)
						)
					).toBe(true)
				} finally {
					errorSpy.mockRestore()
				}
			})

			it('should log matching balances without drift warnings', async () => {
				const apiClient = await setupFullSync([makeTx()])
				apiClient.fetchBalances = vi.fn().mockResolvedValue([{ asset: 'ETH', quantity: 1.0 }])
				mockHoldingsService.getCurrentHoldings = vi
					.fn()
					.mockResolvedValue([{ asset: 'ETH', amount: 1.0, eurInvested: 100, buys: 1, sells: 0 }])
				mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })

				const warnSpy = vi.spyOn(logger, 'warn')
				try {
					await service.syncAccount(1, 1)

					const driftWarns = warnSpy.mock.calls.filter((args) =>
						args.some((arg) => typeof arg === 'string' && arg.includes('reconciliation drift'))
					)
					expect(driftWarns).toHaveLength(0)
				} finally {
					warnSpy.mockRestore()
				}
			})

			it('should keep the sync successful when reconciliation fails', async () => {
				const apiClient = await setupFullSync([makeTx()])
				apiClient.fetchBalances = vi.fn().mockRejectedValue(new Error('portfolio down'))
				mockHoldingsService.getCurrentHoldings = vi
					.fn()
					.mockResolvedValue([{ asset: 'ETH', amount: 1.0, eurInvested: 100, buys: 1, sells: 0 }])
				mockTransactionsService.importTransactions.mockResolvedValue({ imported: 1, errors: [] })

				const result = await service.syncAccount(1, 1)

				expect(result.success).toBe(true)
				expect(result.imported).toBe(1)
				expect(mockAccountsRepo.updateSyncError).not.toHaveBeenCalled()
			})

			it('should not reconcile when the client has no fetchBalances capability', async () => {
				await setupFullSync([makeTx()])
				mockHoldingsService.getCurrentHoldings = vi.fn().mockResolvedValue([])

				await service.syncAccount(1, 1)

				expect(mockHoldingsService.getCurrentHoldings).not.toHaveBeenCalled()
			})
		})
	})
})
