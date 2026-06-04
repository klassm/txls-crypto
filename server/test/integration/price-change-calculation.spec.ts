import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { AssetHoldingsService } from "../../src/modules/asset-holdings/asset-holdings.service.js";
import { AssetHoldingsRepository } from "../../src/modules/asset-holdings/asset-holdings.repository.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { AccountsRepository } from "../../src/modules/accounts/accounts.repository.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import type { CoinPrice } from "../../src/modules/prices/coingecko.service.js";

describe("Price Change Calculation Integration", () => {
	let dataSource: DataSource;
	let pricesRepository: PricesRepository;
	let assetHoldingsService: AssetHoldingsService;

	beforeAll(async () => {
		process.env.DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING || "mysql://testuser:testpass@localhost:3306/txls_test";
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
	});

	describe("calculatePriceChanges", () => {
		it("should calculate correct price changes when all historical prices exist", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ days: 30 }) },
				{ symbol: "BTC", priceEur: 51000, fetchedAt: now.minus({ days: 7 }) },
				{ symbol: "BTC", priceEur: 52000, fetchedAt: now.minus({ hours: 24 }) },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 53000;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).not.toBeNull();
			expect(priceChanges.day?.absolute).toBe(1000);
			expect(priceChanges.day?.relative).toBeCloseTo(1.92, 1);

			expect(priceChanges.week).not.toBeNull();
			expect(priceChanges.week?.absolute).toBe(2000);
			expect(priceChanges.week?.relative).toBeCloseTo(3.92, 1);

			expect(priceChanges.month).not.toBeNull();
			expect(priceChanges.month?.absolute).toBe(3000);
			expect(priceChanges.month?.relative).toBeCloseTo(6.0, 0);
		});

		it("should return null for 30d change when price gap exists (only 35d ago and now)", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 48000, fetchedAt: now.minus({ days: 35 }) },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 53000;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).toBeNull();
			expect(priceChanges.week).toBeNull();
			expect(priceChanges.month).toBeNull();
		});

		it("should return null for 24h change when no price exists at 24h ago", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ days: 7 }) },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 53000;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).toBeNull();
			expect(priceChanges.week).not.toBeNull();
			expect(priceChanges.week?.absolute).toBe(3000);
			// 30d change requires price within 24h of 30-day mark; 7d-old price is too far
			expect(priceChanges.month).toBeNull();
		});

		it("should calculate negative price changes correctly", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 60000, fetchedAt: now.minus({ days: 30 }) },
				{ symbol: "BTC", priceEur: 55000, fetchedAt: now.minus({ days: 7 }) },
				{ symbol: "BTC", priceEur: 52000, fetchedAt: now.minus({ hours: 24 }) },
				{ symbol: "BTC", priceEur: 50000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 50000;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).not.toBeNull();
			expect(priceChanges.day?.absolute).toBe(-2000);
			expect(priceChanges.day?.relative).toBeCloseTo(-3.85, 1);

			expect(priceChanges.week).not.toBeNull();
			expect(priceChanges.week?.absolute).toBe(-5000);
			expect(priceChanges.week?.relative).toBeCloseTo(-9.09, 1);

			expect(priceChanges.month).not.toBeNull();
			expect(priceChanges.month?.absolute).toBe(-10000);
			expect(priceChanges.month?.relative).toBeCloseTo(-16.67, 1);
		});

		it("should return all nulls when no historical prices exist", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 53000;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).toBeNull();
			expect(priceChanges.week).toBeNull();
			expect(priceChanges.month).toBeNull();
		});

		it("should use closest price before target time (getPriceAtOrBefore behavior)", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ days: 30 }).minus({ hours: 12 }) },
				{ symbol: "BTC", priceEur: 51000, fetchedAt: now.minus({ days: 7 }).minus({ hours: 6 }) },
				{ symbol: "BTC", priceEur: 52000, fetchedAt: now.minus({ hours: 25 }) },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 53000;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).not.toBeNull();
			expect(priceChanges.day?.absolute).toBe(1000);
			expect(priceChanges.week).not.toBeNull();
			expect(priceChanges.week?.absolute).toBe(2000);
			expect(priceChanges.month).not.toBeNull();
			expect(priceChanges.month?.absolute).toBe(3000);
		});

		it("should handle zero current price gracefully", async () => {
			const now = DateTime.utc();
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ days: 30 }) },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];

			await pricesRepository.savePrices(prices);

			const currentPrice = 0;
			const priceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", currentPrice);

			expect(priceChanges.day).toBeNull();
			expect(priceChanges.week).toBeNull();
			expect(priceChanges.month).not.toBeNull();
			expect(priceChanges.month?.absolute).toBe(-50000);
			expect(priceChanges.month?.relative).toBe(-100);
		});

		it("should handle multiple assets independently", async () => {
			const now = DateTime.utc();
			const btcPrices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ days: 7 }) },
				{ symbol: "BTC", priceEur: 53000, fetchedAt: now },
			];
			const ethPrices: CoinPrice[] = [
				{ symbol: "ETH", priceEur: 3000, fetchedAt: now.minus({ days: 7 }) },
				{ symbol: "ETH", priceEur: 3300, fetchedAt: now },
			];

			await pricesRepository.savePrices([...btcPrices, ...ethPrices]);

			const btcPriceChanges = await (assetHoldingsService as any).calculatePriceChanges("BTC", 53000);
			const ethPriceChanges = await (assetHoldingsService as any).calculatePriceChanges("ETH", 3300);

			expect(btcPriceChanges.week?.absolute).toBe(3000);
			expect(btcPriceChanges.week?.relative).toBeCloseTo(6.0, 0);

			expect(ethPriceChanges.week?.absolute).toBe(300);
			expect(ethPriceChanges.week?.relative).toBeCloseTo(10.0, 0);
		});
	});
});
