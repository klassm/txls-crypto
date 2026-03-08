import { describe, it, expect, beforeEach, vi } from "vitest";
import { PricesService } from "./prices.service.js";
import { PricesRepository } from "./prices.repository.js";
import { AssetPriceEntity } from "./asset-price.entity.js";
import { DateTime } from "luxon";

describe("PricesService", () => {
	let service: PricesService;
	let mockRepository: any;

	beforeEach(() => {
		mockRepository = {
			getLatestPrice: vi.fn(),
			getLatestPrices: vi.fn(),
			getAllLatestPrices: vi.fn(),
			getPricesInTimeRange: vi.fn(),
		};

		service = new PricesService({} as any);
		(service as any).repository = mockRepository;
	});

	describe("getLatestPrice", () => {
		it("should return asset price when found", async () => {
			const entity = new AssetPriceEntity();
			entity.id = 1;
			entity.asset = "BTC";
			entity.priceEur = 50000;
			entity.fetchedAt = DateTime.utc(2024, 1, 1, 12, 0, 0);
			entity.source = "coingecko";

			mockRepository.getLatestPrice.mockResolvedValue(entity);

			const result = await service.getLatestPrice("BTC");

			expect(result).not.toBeNull();
			expect(result?.asset).toBe("BTC");
			expect(result?.priceEur).toBe(50000);
		});

		it("should return null when price not found", async () => {
			mockRepository.getLatestPrice.mockResolvedValue(null);

			const result = await service.getLatestPrice("UNKNOWN");

			expect(result).toBeNull();
		});
	});

	describe("getLatestPrices", () => {
		it("should return map of asset prices", async () => {
			const entityMap = new Map<string, AssetPriceEntity>();
			const btcEntity = new AssetPriceEntity();
			btcEntity.asset = "BTC";
			btcEntity.priceEur = 50000;
			btcEntity.fetchedAt = DateTime.utc();
			btcEntity.source = "coingecko";
			entityMap.set("BTC", btcEntity);

			mockRepository.getLatestPrices.mockResolvedValue(entityMap);

			const result = await service.getLatestPrices(["BTC"]);

			expect(result.size).toBe(1);
			expect(result.get("BTC")?.priceEur).toBe(50000);
		});
	});

	describe("getAllLatestPrices", () => {
		it("should return all latest prices", async () => {
			const entityMap = new Map<string, AssetPriceEntity>();
			const btcEntity = new AssetPriceEntity();
			btcEntity.asset = "BTC";
			btcEntity.priceEur = 50000;
			btcEntity.fetchedAt = DateTime.utc();
			btcEntity.source = "coingecko";
			entityMap.set("BTC", btcEntity);

			mockRepository.getAllLatestPrices.mockResolvedValue(entityMap);

			const result = await service.getAllLatestPrices();

			expect(result.size).toBe(1);
		});
	});

	describe("getPricesInTimeRange", () => {
		it("should return prices in time range", async () => {
			const entity = new AssetPriceEntity();
			entity.asset = "BTC";
			entity.priceEur = 50000;
			entity.fetchedAt = DateTime.utc(2024, 1, 1, 12, 0, 0);
			entity.source = "coingecko";

			mockRepository.getPricesInTimeRange.mockResolvedValue([entity]);

			const start = DateTime.utc(2024, 1, 1, 0, 0, 0);
			const end = DateTime.utc(2024, 1, 2, 0, 0, 0);

			const result = await service.getPricesInTimeRange("BTC", start, end);

			expect(result).toHaveLength(1);
			expect(result[0].asset).toBe("BTC");
		});
	});
});
