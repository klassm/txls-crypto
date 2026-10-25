import { describe, it, expect, beforeEach, vi } from "vitest";
import { CoinGeckoService } from "./coingecko.service.js";
import { DateTime } from "luxon";

describe("CoinGeckoService", () => {
	let service: CoinGeckoService;
	let mockCoinGeckoRepository: any;
	let mockTransactionsRepository: any;

	beforeEach(() => {
		mockCoinGeckoRepository = {
			findActiveMappings: vi.fn().mockResolvedValue([]),
			upsertMapping: vi.fn().mockResolvedValue(undefined),
		};

		mockTransactionsRepository = {
			getDistinctAssets: vi.fn().mockResolvedValue([]),
		};

		service = new CoinGeckoService(mockCoinGeckoRepository, mockTransactionsRepository);
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

	describe("fetchHistoricalDailyPrices", () => {
		it("should fetch daily market_chart data and keep the last price of each day", async () => {
			(service as any).symbolToIdCache.set("BTC", "bitcoin");
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					prices: [
						[DateTime.utc(2026, 10, 20, 1).toMillis(), 100],
						[DateTime.utc(2026, 10, 20, 12).toMillis(), 105],
						[DateTime.utc(2026, 10, 21, 3).toMillis(), 110],
					],
				}),
			})
			const originalFetch = global.fetch
			global.fetch = fetchMock as any

			try {
				const result = await service.fetchHistoricalDailyPrices("BTC", 10)

				expect(fetchMock).toHaveBeenCalledWith(
					expect.stringContaining("/coins/bitcoin/market_chart?vs_currency=eur&days=10")
				)
				expect(result).toHaveLength(2)
				expect(result[0]).toMatchObject({ symbol: "BTC", priceEur: 105 })
				expect(result[0].fetchedAt.toISODate()).toBe("2026-10-20")
				expect(result[1]).toMatchObject({ symbol: "BTC", priceEur: 110 })
				expect(result[1].fetchedAt.toISODate()).toBe("2026-10-21")
			} finally {
				global.fetch = originalFetch
			}
		})

		it("should return an empty array when the symbol cannot be resolved", async () => {
			const originalFetch = global.fetch
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ coins: [] }),
			}) as any

			try {
				const result = await service.fetchHistoricalDailyPrices("NOTACOIN", 10)

				expect(result).toHaveLength(0)
			} finally {
				global.fetch = originalFetch
			}
		})

		it("should return an empty array when the API responds with an error", async () => {
			;(service as any).symbolToIdCache.set("BTC", "bitcoin")
			const originalFetch = global.fetch
			global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any

			try {
				const result = await service.fetchHistoricalDailyPrices("BTC", 10)

				expect(result).toHaveLength(0)
			} finally {
				global.fetch = originalFetch
			}
		})
	})

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

			mockCoinGeckoRepository.upsertMapping.mockResolvedValue(undefined);

			const result = await service.fetchPrices(["BTC"]);

			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe("BTC");
			expect(result[0].priceEur).toBe(50000);

			global.fetch = originalFetch;
		});
	});
});
