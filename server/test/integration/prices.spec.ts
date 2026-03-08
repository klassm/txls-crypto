import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { CoinGeckoIdEntity } from "../../src/modules/prices/coingecko-id.entity.js";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import type { CoinPrice } from "../../src/modules/prices/coingecko.service.js";

describe("Prices Integration Tests", () => {
	let dataSource: DataSource;
	let repository: PricesRepository;

	beforeAll(async () => {
		process.env.DB_CONNECTION_STRING = ":memory:";
		resetDataSource();
		dataSource = await getDataSource();
		repository = new PricesRepository(dataSource);
	});

	afterAll(async () => {
		if (dataSource && dataSource.isInitialized) {
			await dataSource.destroy();
		}
		resetDataSource();
	});

	beforeEach(async () => {
		await dataSource.getRepository(AssetPriceEntity).clear();
		await dataSource.getRepository(CoinGeckoIdEntity).clear();
	});

	describe("PricesRepository", () => {
		describe("savePrices and getLatestPrice", () => {
			it("should save prices and retrieve latest", async () => {
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: DateTime.utc() },
				];

				await repository.savePrices(prices);

				const result = await repository.getLatestPrice("BTC");

				expect(result).not.toBeNull();
				expect(result?.asset).toBe("BTC");
				expect(Number(result?.priceEur)).toBe(50000);
			});

			it("should return latest price when multiple prices exist", async () => {
				const olderPrice: CoinPrice = {
					symbol: "BTC",
					priceEur: 40000,
					fetchedAt: DateTime.utc().minus({ hours: 1 }),
				};
				const newerPrice: CoinPrice = {
					symbol: "BTC",
					priceEur: 50000,
					fetchedAt: DateTime.utc(),
				};

				await repository.savePrices([olderPrice, newerPrice]);

				const result = await repository.getLatestPrice("BTC");

				expect(result).not.toBeNull();
				expect(Number(result?.priceEur)).toBe(50000);
			});

			it("should return null for unknown asset", async () => {
				const result = await repository.getLatestPrice("UNKNOWN");
				expect(result).toBeNull();
			});
		});

		describe("getLatestPrices", () => {
			it("should return latest prices for multiple assets", async () => {
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: DateTime.utc() },
					{ symbol: "ETH", priceEur: 3000, fetchedAt: DateTime.utc() },
				];

				await repository.savePrices(prices);

				const result = await repository.getLatestPrices(["BTC", "ETH"]);

				expect(result.size).toBe(2);
				expect(Number(result.get("BTC")?.priceEur)).toBe(50000);
				expect(Number(result.get("ETH")?.priceEur)).toBe(3000);
			});

			it("should return empty map for empty assets array", async () => {
				const result = await repository.getLatestPrices([]);
				expect(result.size).toBe(0);
			});
		});

		describe("getAllLatestPrices", () => {
			it("should return all latest prices", async () => {
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: DateTime.utc() },
					{ symbol: "ETH", priceEur: 3000, fetchedAt: DateTime.utc() },
					{ symbol: "SOL", priceEur: 100, fetchedAt: DateTime.utc() },
				];

				await repository.savePrices(prices);

				const result = await repository.getAllLatestPrices();

				expect(result.size).toBe(3);
			});
		});

		describe("getPricesInTimeRange", () => {
			it("should return prices within time range", async () => {
				const now = DateTime.utc();
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 40000, fetchedAt: now.minus({ hours: 2 }) },
					{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ hours: 1 }) },
					{ symbol: "BTC", priceEur: 55000, fetchedAt: now },
				];

				await repository.savePrices(prices);

				const startTime = now.minus({ minutes: 90 });
				const endTime = now.plus({ minutes: 1 });

				const result = await repository.getPricesInTimeRange("BTC", startTime, endTime);

				expect(result).toHaveLength(2);
			});
		});

		describe("deleteOldPrices", () => {
			it("should delete prices older than specified days", async () => {
				const oldPrice: CoinPrice = {
					symbol: "BTC",
					priceEur: 40000,
					fetchedAt: DateTime.utc().minus({ days: 35 }),
				};
				const newPrice: CoinPrice = {
					symbol: "BTC",
					priceEur: 50000,
					fetchedAt: DateTime.utc(),
				};

				await repository.savePrices([oldPrice, newPrice]);

				const deleted = await repository.deleteOldPrices(30);

				expect(deleted).toBe(1);

				const remaining = await repository.getLatestPrice("BTC");
				expect(remaining).not.toBeNull();
				expect(Number(remaining?.priceEur)).toBe(50000);
			});
		});
	});

	describe("CoinGeckoIdEntity", () => {
		it("should persist symbol mappings", async () => {
			const mapping = new CoinGeckoIdEntity();
			mapping.symbol = "BTC";
			mapping.coinGeckoId = "bitcoin";
			mapping.name = "Bitcoin";
			mapping.isActive = true;
			mapping.createdAt = DateTime.utc();
			mapping.updatedAt = DateTime.utc();

			await dataSource.getRepository(CoinGeckoIdEntity).save(mapping);

			const found = await dataSource.getRepository(CoinGeckoIdEntity).findOne({
				where: { symbol: "BTC" },
			});

			expect(found).not.toBeNull();
			expect(found?.coinGeckoId).toBe("bitcoin");
		});

		it("should enforce unique symbol constraint", async () => {
			const mapping1 = new CoinGeckoIdEntity();
			mapping1.symbol = "ETH";
			mapping1.coinGeckoId = "ethereum";
			mapping1.name = "Ethereum";
			mapping1.isActive = true;
			mapping1.createdAt = DateTime.utc();
			mapping1.updatedAt = DateTime.utc();

			await dataSource.getRepository(CoinGeckoIdEntity).save(mapping1);

			const mapping2 = new CoinGeckoIdEntity();
			mapping2.symbol = "ETH";
			mapping2.coinGeckoId = "ethereum-2";
			mapping2.name = "Ethereum 2";
			mapping2.isActive = true;
			mapping2.createdAt = DateTime.utc();
			mapping2.updatedAt = DateTime.utc();

			await expect(
				dataSource.getRepository(CoinGeckoIdEntity).save(mapping2)
			).rejects.toThrow();
		});
	});
});
