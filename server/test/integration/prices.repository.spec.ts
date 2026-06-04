import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { CoinGeckoIdEntity } from "../../src/modules/prices/coingecko-id.entity.js";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import type { CoinPrice } from "../../src/modules/prices/coingecko.service.js";

describe("Prices Repository Integration", () => {
	let dataSource: DataSource;
	let repository: PricesRepository;

	beforeAll(async () => {
		process.env.DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING || "mysql://testuser:testpass@localhost:3306/txls_test";
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

		describe("getPriceHistoryBatch", () => {
			it("should return price history for multiple assets", async () => {
				const now = DateTime.utc();
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ days: 2 }) },
					{ symbol: "BTC", priceEur: 51000, fetchedAt: now.minus({ days: 1 }) },
					{ symbol: "BTC", priceEur: 52000, fetchedAt: now },
					{ symbol: "ETH", priceEur: 3000, fetchedAt: now.minus({ days: 1 }) },
					{ symbol: "ETH", priceEur: 3100, fetchedAt: now },
					{ symbol: "SOL", priceEur: 100, fetchedAt: now },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceHistoryBatch(
					["BTC", "ETH", "SOL"],
					now.minus({ days: 3 }),
					now.plus({ days: 1 })
				);

				expect(result.size).toBe(3);
				expect(result.get("BTC")?.length).toBe(3);
				expect(result.get("ETH")?.length).toBe(2);
				expect(result.get("SOL")?.length).toBe(1);
			});

			it("should return one price per day (latest)", async () => {
				const now = DateTime.utc();
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ hours: 5 }) },
					{ symbol: "BTC", priceEur: 51000, fetchedAt: now.minus({ hours: 2 }) },
					{ symbol: "BTC", priceEur: 52000, fetchedAt: now },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceHistoryBatch(
					["BTC"],
					now.minus({ days: 1 }),
					now.plus({ days: 1 })
				);

				expect(result.get("BTC")?.length).toBe(1);
				expect(Number(result.get("BTC")?.[0]?.priceEur)).toBe(52000);
			});

			it("should return empty map for empty assets array", async () => {
				const now = DateTime.utc();
				const result = await repository.getPriceHistoryBatch([], now.minus({ days: 1 }), now);

				expect(result.size).toBe(0);
			});
		});

		describe("getPriceForDate", () => {
			it("should return price when price exists on the same day", async () => {
				const testDate = DateTime.utc(2024, 1, 15, 12, 0, 0);
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: testDate },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceForDate("BTC", testDate);

				expect(result).not.toBeNull();
				expect(result?.asset).toBe("BTC");
				expect(Number(result?.priceEur)).toBe(50000);
			});

			it("should return null when price is from a different day", async () => {
				const priceDate = DateTime.utc(2024, 1, 14, 12, 0, 0);
				const queryDate = DateTime.utc(2024, 1, 15, 12, 0, 0);
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: priceDate },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceForDate("BTC", queryDate);

				expect(result).toBeNull();
			});

			it("should return null when no price exists for asset", async () => {
				const testDate = DateTime.utc(2024, 1, 15);

				const result = await repository.getPriceForDate("UNKNOWN", testDate);

				expect(result).toBeNull();
			});

			it("should return latest price when multiple prices exist on same day", async () => {
				const testDate = DateTime.utc(2024, 1, 15, 12, 0, 0);
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: testDate.minus({ hours: 2 }) },
					{ symbol: "BTC", priceEur: 51000, fetchedAt: testDate },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceForDate("BTC", testDate);

				expect(result).not.toBeNull();
				expect(Number(result?.priceEur)).toBe(51000);
			});

			it("should return price for any time on the same day", async () => {
				const priceTime = DateTime.utc(2024, 1, 15, 3, 0, 0);
				const queryTime = DateTime.utc(2024, 1, 15, 20, 0, 0);
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: priceTime },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceForDate("BTC", queryTime);

				expect(result).not.toBeNull();
				expect(Number(result?.priceEur)).toBe(50000);
			});

			it("should not return price from previous day even if later in time", async () => {
				const priceTime = DateTime.utc(2024, 1, 14, 23, 0, 0);
				const queryTime = DateTime.utc(2024, 1, 15, 1, 0, 0);
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: priceTime },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceForDate("BTC", queryTime);

				expect(result).toBeNull();
			});
		});

		describe("getPriceAtOrBefore", () => {
			it("should return the most recent price at or before target time", async () => {
				const now = DateTime.utc();
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 48000, fetchedAt: now.minus({ hours: 48 }) },
					{ symbol: "BTC", priceEur: 49000, fetchedAt: now.minus({ hours: 25 }) },
					{ symbol: "BTC", priceEur: 50000, fetchedAt: now.minus({ hours: 1 }) },
					{ symbol: "BTC", priceEur: 51000, fetchedAt: now },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceAtOrBefore("BTC", now.minus({ hours: 24 }));

				expect(result).not.toBeNull();
				expect(Number(result?.priceEur)).toBe(49000);
			});

			it("should return null when no price exists before target time", async () => {
				const now = DateTime.utc();
				const prices: CoinPrice[] = [
					{ symbol: "BTC", priceEur: 50000, fetchedAt: now },
				];

				await repository.savePrices(prices);

				const result = await repository.getPriceAtOrBefore("BTC", now.minus({ hours: 1 }));

				expect(result).toBeNull();
			});

			it("should return null for unknown asset", async () => {
				const result = await repository.getPriceAtOrBefore("UNKNOWN", DateTime.utc());
				expect(result).toBeNull();
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
