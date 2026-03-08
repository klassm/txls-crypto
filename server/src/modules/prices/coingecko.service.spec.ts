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
			create: vi.fn().mockImplementation((data) => data),
		};

		const transactionRepo = {
			createQueryBuilder: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnThis(),
				getRawMany: vi.fn().mockResolvedValue([]),
			}),
		};

		mockDataSource = {
			getRepository: vi.fn().mockImplementation((entity) => {
				if (entity.name === "CoinGeckoIdEntity") {
					return mockRepository;
				}
				return transactionRepo;
			}),
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

		it("should lookup uncached symbols", async () => {
			const originalFetch = global.fetch;
			global.fetch = vi.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ bitcoin: { eur: 50000 } }),
				});

			mockRepository.execute.mockResolvedValue({});

			const result = await service.fetchPrices(["BTC"]);

			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe("BTC");
			expect(result[0].priceEur).toBe(50000);

			global.fetch = originalFetch;
		});
	});
});
