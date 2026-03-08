import { describe, it, expect, beforeEach, vi } from "vitest";
import { PricesRepository } from "./prices.repository.js";
import { AssetPriceEntity } from "./asset-price.entity.js";
import { DateTime } from "luxon";
import type { CoinPrice } from "./coingecko.service.js";

describe("PricesRepository", () => {
	let repository: PricesRepository;
	let mockDataSource: any;
	let mockQueryBuilder: any;
	let mockRepository: any;

	beforeEach(() => {
		const insertBuilder = {
			into: vi.fn().mockReturnThis(),
			values: vi.fn().mockReturnThis(),
			execute: vi.fn().mockResolvedValue({}),
		};

		mockQueryBuilder = {
			insert: vi.fn().mockReturnValue(insertBuilder),
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			getOne: vi.fn(),
			getMany: vi.fn(),
			delete: vi.fn().mockReturnThis(),
			execute: vi.fn(),
		};

		mockRepository = {
			createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
		};

		mockDataSource = {
			getRepository: vi.fn().mockReturnValue(mockRepository),
			query: vi.fn(),
		};

		repository = new PricesRepository(mockDataSource);
	});

	describe("savePrices", () => {
		it("should save multiple prices", async () => {
			const prices: CoinPrice[] = [
				{ symbol: "BTC", priceEur: 50000, fetchedAt: DateTime.utc() },
				{ symbol: "ETH", priceEur: 3000, fetchedAt: DateTime.utc() },
			];

			await repository.savePrices(prices);

			expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
		});

		it("should do nothing if prices array is empty", async () => {
			await repository.savePrices([]);
			expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
		});
	});

	describe("getLatestPrice", () => {
		it("should return latest price for asset", async () => {
			const mockEntity = new AssetPriceEntity();
			mockEntity.id = 1;
			mockEntity.asset = "BTC";
			mockEntity.priceEur = 50000;
			mockEntity.fetchedAt = DateTime.utc();
			mockEntity.source = "coingecko";

			mockQueryBuilder.getOne.mockResolvedValue(mockEntity);

			const result = await repository.getLatestPrice("BTC");

			expect(result).toEqual(mockEntity);
			expect(mockQueryBuilder.where).toHaveBeenCalledWith(
				"price.asset = :asset",
				{ asset: "BTC" }
			);
		});

		it("should return null if no price found", async () => {
			mockQueryBuilder.getOne.mockResolvedValue(null);

			const result = await repository.getLatestPrice("UNKNOWN");

			expect(result).toBeNull();
		});
	});

	describe("getLatestPrices", () => {
		it("should return map of latest prices", async () => {
			mockDataSource.query.mockResolvedValue([
				{ id: 1, asset: "BTC", price_eur: 50000, fetched_at: Date.now(), source: "coingecko", created_at: Date.now() },
				{ id: 2, asset: "ETH", price_eur: 3000, fetched_at: Date.now(), source: "coingecko", created_at: Date.now() },
			]);

			const result = await repository.getLatestPrices(["BTC", "ETH"]);

			expect(result.size).toBe(2);
			expect(result.get("BTC")?.priceEur).toBe(50000);
			expect(result.get("ETH")?.priceEur).toBe(3000);
		});

		it("should return empty map for empty assets array", async () => {
			const result = await repository.getLatestPrices([]);
			expect(result.size).toBe(0);
		});
	});

	describe("getAllLatestPrices", () => {
		it("should return all latest prices", async () => {
			mockDataSource.query.mockResolvedValue([
				{ id: 1, asset: "BTC", price_eur: 50000, fetched_at: Date.now(), source: "coingecko", created_at: Date.now() },
			]);

			const result = await repository.getAllLatestPrices();

			expect(result.size).toBe(1);
			expect(result.get("BTC")?.priceEur).toBe(50000);
		});
	});

	describe("deleteOldPrices", () => {
		it("should delete prices older than specified days", async () => {
			mockQueryBuilder.execute.mockResolvedValue({ affected: 5 });

			const result = await repository.deleteOldPrices(30);

			expect(result).toBe(5);
		});

		it("should return 0 if no prices deleted", async () => {
			mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

			const result = await repository.deleteOldPrices(30);

			expect(result).toBe(0);
		});
	});
});
