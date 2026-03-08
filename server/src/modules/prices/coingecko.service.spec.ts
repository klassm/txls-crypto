import { describe, it, expect, beforeEach, vi } from "vitest";
import { CoinGeckoService } from "./coingecko.service.js";
import { CoinGeckoIdEntity } from "./coingecko-id.entity.js";
import { DateTime } from "luxon";

describe("CoinGeckoService", () => {
	let service: CoinGeckoService;
	let mockDataSource: any;
	let mockRepository: any;

	beforeEach(() => {
		mockRepository = {
			find: vi.fn(),
			createQueryBuilder: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			into: vi.fn().mockReturnThis(),
			values: vi.fn().mockReturnThis(),
			orUpdate: vi.fn().mockReturnThis(),
			execute: vi.fn(),
		};

		mockDataSource = {
			getRepository: vi.fn().mockReturnValue(mockRepository),
		};

		service = new CoinGeckoService(mockDataSource);
	});

	describe("getCoinGeckoId", () => {
		it("should return cached symbol mapping", async () => {
			(service as any).symbolToIdCache.set("BTC", "bitcoin");

			const result = service.getCoinGeckoId("BTC");

			expect(result).toBe("bitcoin");
		});

		it("should be case-insensitive", async () => {
			(service as any).symbolToIdCache.set("BTC", "bitcoin");

			const result = service.getCoinGeckoId("btc");

			expect(result).toBe("bitcoin");
		});

		it("should return undefined for unknown symbol", async () => {
			const result = service.getCoinGeckoId("UNKNOWN");

			expect(result).toBeUndefined();
		});
	});

	describe("getCachedSymbols", () => {
		it("should return all cached symbols", async () => {
			(service as any).symbolToIdCache.set("BTC", "bitcoin");
			(service as any).symbolToIdCache.set("ETH", "ethereum");

			const result = service.getCachedSymbols();

			expect(result).toContain("BTC");
			expect(result).toContain("ETH");
		});
	});

	describe("fetchPrices", () => {
		it("should return empty array for empty symbols", async () => {
			const result = await service.fetchPrices([]);

			expect(result).toHaveLength(0);
		});

		it("should batch requests for more than 50 symbols", async () => {
			const symbols = Array.from({ length: 60 }, (_, i) => `COIN${i}`);
			const fetchSpy = vi.spyOn(service as any, "fetchPricesBatch")
				.mockImplementation(async (batch: unknown) => 
					(batch as string[]).map(s => ({ symbol: s, priceEur: 100, fetchedAt: DateTime.utc() }))
				);

			const result = await service.fetchPrices(symbols);

			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(result).toHaveLength(60);
		});
	});
});
