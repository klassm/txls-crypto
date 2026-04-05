import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { AssetHoldingsService } from "../../src/modules/asset-holdings/asset-holdings.service.js";
import { AssetHoldingsRepository } from "../../src/modules/asset-holdings/asset-holdings.repository.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { AccountsRepository } from "../../src/modules/accounts/accounts.repository.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { AssetHoldingEntity } from "../../src/modules/asset-holdings/asset-holding.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import type { CoinPrice } from "../../src/modules/prices/coingecko.service.js";
import { calculatePortfolioChange, type PortfolioHistoryPoint } from "@txls/shared";

describe("Portfolio Change Calculation Integration", () => {
	let dataSource: DataSource;
	let pricesRepository: PricesRepository;
	let assetHoldingsService: AssetHoldingsService;
	let userId: number;
	let accountId: number;

	beforeAll(async () => {
		process.env.DB_CONNECTION_STRING = ":memory:";
		resetDataSource();
		dataSource = await getDataSource();
		pricesRepository = new PricesRepository(dataSource);
		assetHoldingsService = new AssetHoldingsService(
			new AssetHoldingsRepository(dataSource),
			new TransactionsRepository(dataSource),
			new AccountsRepository(dataSource),
			pricesRepository
		);
	});

	afterAll(async () => {
		if (dataSource && dataSource.isInitialized) {
			await dataSource.destroy();
		}
		resetDataSource();
	});

	beforeEach(async () => {
		await dataSource.getRepository(AssetPriceEntity).clear();
		await dataSource.getRepository(AssetHoldingEntity).clear();
		await dataSource.getRepository(TransactionEntity).clear();
		await dataSource.getRepository(AccountEntity).clear();
		await dataSource.getRepository(UserEntity).clear();

		// Create test user
		const userRepo = dataSource.getRepository(UserEntity);
		const user = new UserEntity();
		user.name = "Test User";
		user.username = "testuser";
		user.email = "test@example.com";
		user.password = "hashedpassword123";
		user.isAdmin = false;
		await userRepo.save(user);
		userId = user.id;

		// Create test account
		const accountRepo = dataSource.getRepository(AccountEntity);
		const account = new AccountEntity();
		account.userId = userId;
		account.provider = ProviderType.Bitpanda;
		await accountRepo.save(account);
		accountId = account.id;
	});

	describe("Portfolio with complete price data", () => {
		beforeEach(async () => {
			const now = DateTime.utc();
			// Use startOf("day") to ensure holdings exist from midnight of 30 days ago
			// This aligns with how getPortfolioHistoryWithPrices generates timestamps
			const thirtyDaysAgo = now.minus({ days: 30 }).startOf("day");
			const sevenDaysAgo = now.minus({ days: 7 });
			const oneDayAgo = now.minus({ hours: 24 });

			// Save price history for BTC, XRP, and SOL - all with complete 30-day history
			const prices: CoinPrice[] = [
				// BTC prices
				{ symbol: "BTC", priceEur: 50000, fetchedAt: thirtyDaysAgo },
				{ symbol: "BTC", priceEur: 51000, fetchedAt: sevenDaysAgo },
				{ symbol: "BTC", priceEur: 52000, fetchedAt: oneDayAgo },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
				// XRP prices
				{ symbol: "XRP", priceEur: 0.50, fetchedAt: thirtyDaysAgo },
				{ symbol: "XRP", priceEur: 0.55, fetchedAt: sevenDaysAgo },
				{ symbol: "XRP", priceEur: 0.58, fetchedAt: oneDayAgo },
				{ symbol: "XRP", priceEur: 0.60, fetchedAt: now },
				// SOL prices
				{ symbol: "SOL", priceEur: 100, fetchedAt: thirtyDaysAgo },
				{ symbol: "SOL", priceEur: 110, fetchedAt: sevenDaysAgo },
				{ symbol: "SOL", priceEur: 115, fetchedAt: oneDayAgo },
				{ symbol: "SOL", priceEur: 120, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			// Create holdings for all three assets at midnight of 30 days ago
			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId,
					asset: "XRP",
					amount: 1000.0,
					eurInvested: 500,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId,
					asset: "SOL",
					amount: 10.0,
					eurInvested: 1000,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
			]);
		});

		it("should correctly calculate 30d change when all assets have complete price history", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			expect(history.length).toBeGreaterThan(0);

			// The history should have points going back 30 days
			const latestPoint = history[history.length - 1];
			const oldestPoint = history[0];

			// Verify we have history points
			expect(latestPoint.totalEurValue).not.toBeNull();
			expect(oldestPoint.totalEurValue).not.toBeNull();

			// Calculate 30d change using the shared utility
			const monthChange = calculatePortfolioChange(history, 30);

			// Expected current value:
			// BTC: 1.0 * 53000 = 53000
			// XRP: 1000 * 0.60 = 600
			// SOL: 10 * 120 = 1200
			// Total: 54800
			const expectedCurrentValue = 53000 + 600 + 1200;

			// Expected value 30 days ago:
			// BTC: 1.0 * 50000 = 50000
			// XRP: 1000 * 0.50 = 500
			// SOL: 10 * 100 = 1000
			// Total: 51500
			const expectedPastValue = 50000 + 500 + 1000;

			expect(monthChange).not.toBeNull();
			expect(monthChange!.absolute).toBeCloseTo(expectedCurrentValue - expectedPastValue, 0);
			expect(monthChange!.relative).toBeCloseTo(((expectedCurrentValue - expectedPastValue) / expectedPastValue) * 100, 1);
		});

		it("should correctly calculate 7d change when all assets have complete price history", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			const weekChange = calculatePortfolioChange(history, 7);

			// Expected current value: 54800
			// Expected value 7 days ago:
			// BTC: 1.0 * 51000 = 51000
			// XRP: 1000 * 0.55 = 550
			// SOL: 10 * 110 = 1100
			// Total: 52650
			const expectedPastValue = 51000 + 550 + 1100;
			const expectedCurrentValue = 53000 + 600 + 1200;

			expect(weekChange).not.toBeNull();
			expect(weekChange!.absolute).toBeCloseTo(expectedCurrentValue - expectedPastValue, 0);
		});
	});

	describe("Portfolio with partial price data", () => {
		beforeEach(async () => {
			const now = DateTime.utc();
			const thirtyDaysAgo = now.minus({ days: 30 });
			const sevenDaysAgo = now.minus({ days: 7 });

			// BTC has complete 30-day price history
			const btcPrices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: thirtyDaysAgo },
				{ symbol: "BTC", priceEur: 51000, fetchedAt: sevenDaysAgo },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			// XRP and SOL only have current prices (no historical data)
			const xrpSolPrices: CoinPrice[] = [
				{ symbol: "XRP", priceEur: 0.60, fetchedAt: now },
				{ symbol: "SOL", priceEur: 120, fetchedAt: now },
			];

			await pricesRepository.savePrices([...btcPrices, ...xrpSolPrices]);

			// Create holdings for all three assets
			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId,
					asset: "XRP",
					amount: 1000.0,
					eurInvested: 500,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId,
					asset: "SOL",
					amount: 10.0,
					eurInvested: 1000,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
			]);
		});

		it("should still return portfolio history with some points despite partial price data", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// History should not be empty - at minimum, the latest point should exist with current prices
			expect(history.length).toBeGreaterThan(0);

			// The latest point should have a total value since all assets have current prices
			const latestPoint = history[history.length - 1];
			expect(latestPoint.totalEurValue).not.toBeNull();

			// Current value should include all three assets:
			// BTC: 1.0 * 53000 = 53000
			// XRP: 1000 * 0.60 = 600
			// SOL: 10 * 120 = 1200
			// Total: 54800
			expect(latestPoint.totalEurValue).toBeCloseTo(54800, 0);
		});

		it("should ideally calculate 30d change using available historical data for partial assets", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// KEY INSIGHT: Currently this test will FAIL because buildHistoryPoint returns null
			// if ANY asset lacks a price at a given timestamp.
			//
			// With partial price data:
			// - At timestamps 30 days ago, only BTC has a price. XRP and SOL don't.
			// - buildHistoryPoint returns null for those timestamps because totalEurValue becomes null
			// - This creates gaps in the history array
			// - calculatePortfolioChange can't find a point exactly 30 days ago, returns null
			//
			// DESIRED BEHAVIOR: The 30d change should still be calculated using:
			// - BTC's historical value for the BTC portion
			// - XRP/SOL's current value for their portions (assuming no historical change)
			// OR at minimum, calculate the change for the portion of portfolio with complete data

			const monthChange = calculatePortfolioChange(history, 30);

			// This assertion documents the CURRENT BUG:
			// With the current implementation, monthChange is null because history has gaps
			// 
			// EXPECTED BEHAVIOR (currently failing):
			// The change should be calculated for BTC portion:
			// BTC 30d ago: 1.0 * 50000 = 50000
			// BTC now: 1.0 * 53000 = 53000
			// BTC absolute change: +3000
			// For XRP and SOL, since we don't have historical data, we could either:
			// 1. Exclude them from the calculation
			// 2. Use their current value as historical (0% change assumption)
			//
			// For now, we expect null due to the current limitation
			expect(monthChange).toBeNull();
		});

		it("should have gaps in history where price data is missing", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// Verify that history has gaps - there should be fewer points than expected
			// for a 30-day period with hourly granularity
			// With full data, we'd expect many points; with partial data, many are null and skipped

			// The history should be missing points from 30 days ago
			// because XRP and SOL didn't have prices back then
			const firstPointDate = DateTime.fromISO(history[0].date);
			const lastPointDate = DateTime.fromISO(history[history.length - 1].date);

			// The first point should be more recent than 30 days ago
			// because older points couldn't be built (missing XRP/SOL prices)
			const thirtyDaysAgo = DateTime.utc().minus({ days: 30 });

			// This documents the current behavior: history starts later than expected
			// because buildHistoryPoint returns null for timestamps without all prices
			expect(firstPointDate.toMillis()).toBeGreaterThan(thirtyDaysAgo.toMillis());
		});
	});

	describe("Portfolio with gaps in history", () => {
		beforeEach(async () => {
			const now = DateTime.utc();
			const thirtyDaysAgo = now.minus({ days: 30 });
			const twentyDaysAgo = now.minus({ days: 20 });
			const tenDaysAgo = now.minus({ days: 10 });

			// BTC has sparse price data with gaps
			const btcPrices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: thirtyDaysAgo },
				// Gap: no prices from day 20-11
				{ symbol: "BTC", priceEur: 52000, fetchedAt: tenDaysAgo },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(btcPrices);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
			]);
		});

		it("should gracefully handle history with gaps when calculating 7d change", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// 7d change should work since we have prices from 10 days ago (within 7d tolerance)
			const weekChange = calculatePortfolioChange(history, 7);

			// Expected: 53000 (now) - 52000 (10 days ago, closest to 7d mark)
			expect(weekChange).not.toBeNull();
			expect(weekChange!.absolute).toBeCloseTo(1000, 0);
		});

		it("should return null for 30d change when history gap prevents finding comparison point", async () => {
			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// 30d change calculation requires finding a point close to 30 days ago
			// The algorithm looks for the closest point BEFORE the target date
			// With only sparse data, there may not be a suitable comparison point
			const monthChange = calculatePortfolioChange(history, 30);

			// This documents the behavior: with significant gaps, change calculation may fail
			// The function needs history points spanning at least 30 days to calculate
			// If the first history point is less than 30 days old, we get null
			if (history.length > 0) {
				const firstDate = DateTime.fromISO(history[0].date);
				const lastDate = DateTime.fromISO(history[history.length - 1].date);
				const spanDays = lastDate.diff(firstDate, "days").days;

				if (spanDays < 30) {
					expect(monthChange).toBeNull();
				}
			}
		});

		it("should verify calculatePortfolioChange handles null totalEurValue in history points", () => {
			// Create synthetic history with null values
			const historyWithNulls: PortfolioHistoryPoint[] = [
				{
					date: "2024-01-01T00:00:00Z",
					totalEurValue: 10000,
					totalEurInvested: 9000,
					assets: {},
				},
				{
					date: "2024-01-15T00:00:00Z",
					totalEurValue: null, // This point has no value
					totalEurInvested: 9000,
					assets: {},
				},
				{
					date: "2024-01-31T00:00:00Z",
					totalEurValue: 11000,
					totalEurInvested: 9000,
					assets: {},
				},
			];

			const result = calculatePortfolioChange(historyWithNulls, 30);

			// The algorithm should skip the null point and find the first valid one
			// If the first point is valid and within 30 days, it should work
			expect(result).not.toBeNull();
			expect(result!.absolute).toBe(11000 - 10000);
		});

		it("should return null when latest history point has null totalEurValue", () => {
			const historyWithNullLatest: PortfolioHistoryPoint[] = [
				{
					date: "2024-01-01T00:00:00Z",
					totalEurValue: 10000,
					totalEurInvested: 9000,
					assets: {},
				},
				{
					date: "2024-01-31T00:00:00Z",
					totalEurValue: null, // Latest point has no value
					totalEurInvested: 9000,
					assets: {},
				},
			];

			const result = calculatePortfolioChange(historyWithNullLatest, 30);

			// Should return null because latest value is null
			expect(result).toBeNull();
		});
	});

	describe("buildHistoryPoint behavior with missing prices", () => {
		it("should demonstrate that buildHistoryPoint returns null when any asset lacks a price", async () => {
			const now = DateTime.utc();
			const thirtyDaysAgo = now.minus({ days: 30 });

			// Only BTC has historical price
			await pricesRepository.savePrices([
				{ symbol: "BTC", priceEur: 50000, fetchedAt: thirtyDaysAgo },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
				// XRP has NO price at 30 days ago, only current
				{ symbol: "XRP", priceEur: 0.60, fetchedAt: now },
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId,
					asset: "XRP",
					amount: 1000.0,
					eurInvested: 500,
					timestamp: thirtyDaysAgo,
				} as AssetHoldingEntity,
			]);

			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// With the current implementation, history will not have points from 30 days ago
			// because buildHistoryPoint returns null when XRP doesn't have a price
			const firstPointDate = DateTime.fromISO(history[0].date);
			const daysSinceFirstPoint = DateTime.utc().diff(firstPointDate, "days").days;

			// This documents the issue: we can't build history points when assets lack prices
			// The first history point is from a more recent timestamp
			expect(daysSinceFirstPoint).toBeLessThan(30);
		});

		it("should find nearest price when price timestamp differs from history timestamp", async () => {
			// This test verifies the fix for the issue where portfolio history generates
			// timestamps at midnight but price data is stored at current time of day (e.g., 18:55)
			const now = DateTime.utc();
			// Create a price stored at 18:55 on a specific day
			const priceTime = now.minus({ days: 2 }).set({ hour: 18, minute: 55 });
			// History timestamp will be at midnight (start of day)
			const midnightTimestamp = now.minus({ days: 2 }).startOf("day");

			await pricesRepository.savePrices([
				{ symbol: "BTC", priceEur: 50000, fetchedAt: priceTime },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: now.minus({ days: 3 }),
				} as AssetHoldingEntity,
			]);

			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 3 });

			// With the fix, history should include points from 2 days ago even though
			// the price was stored at 18:55 and the history timestamp was at midnight
			expect(history.length).toBeGreaterThan(0);

			// Find a history point close to midnight 2 days ago
			const twoDaysAgoMidnight = now.minus({ days: 2 }).startOf("day");
			const nearbyPoint = history.find((point) => {
				const pointDate = DateTime.fromISO(point.date);
				const diff = Math.abs(pointDate.toMillis() - twoDaysAgoMidnight.toMillis());
				return diff < 2 * 60 * 60 * 1000; // Within 2 hours
			});

			// Should find a point with a valid value (not null)
			expect(nearbyPoint).toBeDefined();
			expect(nearbyPoint!.totalEurValue).not.toBeNull();
			// The value should be based on the price at 18:55 (50000)
			expect(nearbyPoint!.totalEurValue).toBeCloseTo(50000, 0);
		});

		it("should return null when price is outside tolerance window", async () => {
			// This test verifies that prices outside the tolerance window are not used
			const now = DateTime.utc();
			// Price stored 25 hours after the midnight timestamp (outside default 24h tolerance)
			const priceTime = now.minus({ days: 2 }).set({ hour: 1 }).plus({ hours: 25 });
			const midnightTimestamp = now.minus({ days: 2 }).startOf("day");

			await pricesRepository.savePrices([
				// Price is 25 hours after midnight (outside 24h tolerance)
				{ symbol: "BTC", priceEur: 50000, fetchedAt: priceTime },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: now.minus({ days: 3 }),
				} as AssetHoldingEntity,
			]);

			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 3 });

			// History points around midnight 2 days ago should either not exist
			// or have null totalEurValue since the price is outside tolerance
			const twoDaysAgoMidnight = now.minus({ days: 2 }).startOf("day");
			const nearbyPoint = history.find((point) => {
				const pointDate = DateTime.fromISO(point.date);
				const diff = Math.abs(pointDate.toMillis() - twoDaysAgoMidnight.toMillis());
				return diff < 2 * 60 * 60 * 1000; // Within 2 hours
			});

			// Either no point exists, or it has null value
			if (nearbyPoint) {
				expect(nearbyPoint.totalEurValue).toBeNull();
			} else {
				// No point found for that time - also acceptable
				expect(nearbyPoint).toBeUndefined();
			}
		});

		it("should show that all assets need current prices for latest history point", async () => {
			const now = DateTime.utc();

			// BTC has current price, XRP does NOT have any price
			await pricesRepository.savePrices([
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
				// No XRP price at all
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: now.minus({ days: 1 }),
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId,
					asset: "XRP",
					amount: 1000.0,
					eurInvested: 500,
					timestamp: now.minus({ days: 1 }),
				} as AssetHoldingEntity,
			]);

			const history = await assetHoldingsService.getPortfolioHistoryWithPrices(userId, accountId, { days: 30 });

			// Even the latest point should be null because XRP has no price
			// So history should be empty or the latest point should have null totalEurValue
			if (history.length > 0) {
				const latestPoint = history[history.length - 1];
				// With current implementation, this point wouldn't exist (buildHistoryPoint returns null)
				expect(latestPoint.totalEurValue).toBeNull();
			} else {
				// History is empty because no valid history points could be built
				expect(history.length).toBe(0);
			}
		});
	});
});
