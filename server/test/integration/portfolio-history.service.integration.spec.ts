import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { getDataSource } from "../../src/database.js";
import { PortfolioSnapshotsService } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.service.js";
import { PortfolioSnapshotsRepository } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.repository.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { PortfolioSnapshotEntity } from "../../src/modules/portfolio-snapshots/portfolio-snapshot.entity.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { DateTime } from "luxon";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";
import { TransactionType } from "@txls/shared";

describe("PortfolioSnapshotsService Integration Tests - getPortfolioHistoryWithPrices", () => {
	let service: PortfolioSnapshotsService;
	let snapshotsRepository: PortfolioSnapshotsRepository;
	let pricesRepository: PricesRepository;
	let dataSource: any;

	afterAll(async () => {
		await destroyTestDataSource();
	});

	beforeEach(async () => {
		await createTestDataSource();
		dataSource = await getDataSource();
		snapshotsRepository = new PortfolioSnapshotsRepository(dataSource);
		pricesRepository = new PricesRepository(dataSource);
		service = new PortfolioSnapshotsService(dataSource, snapshotsRepository, pricesRepository);
	});

	const createSnapshot = async (overrides: Partial<{
		userId: number;
		providerAccountId: number;
		asset: string;
		date: DateTime;
		amount: number;
		eurInvested: number;
		buyCount: number;
		sellCount: number;
	}> = {}) => {
		const snapshot = new PortfolioSnapshotEntity();
		snapshot.userId = overrides.userId ?? 1;
		snapshot.providerAccountId = overrides.providerAccountId ?? 1;
		snapshot.asset = overrides.asset ?? "BTC";
		snapshot.date = overrides.date ?? DateTime.utc(2024, 6, 15);
		snapshot.amount = overrides.amount ?? 1.0;
		snapshot.eurInvested = overrides.eurInvested ?? 50000;
		snapshot.buyCount = overrides.buyCount ?? 1;
		snapshot.sellCount = overrides.sellCount ?? 0;
		return dataSource.getRepository(PortfolioSnapshotEntity).save(snapshot);
	};

	const createPrice = async (asset: string, priceEur: number, fetchedAt: DateTime) => {
		const price = new AssetPriceEntity();
		price.asset = asset;
		price.priceEur = priceEur;
		price.fetchedAt = fetchedAt;
		price.source = "test";
		price.createdAt = DateTime.utc();
		return dataSource.getRepository(AssetPriceEntity).save(price);
	};

	const createTransaction = async (overrides: Partial<{
		userId: number;
		providerAccountId: number;
		asset: string;
		type: TransactionType;
		quantity: number;
		eurValue: number;
		timestamp: DateTime;
	}> = {}) => {
		const tx = new TransactionEntity();
		tx.userId = overrides.userId ?? 1;
		tx.providerAccountId = overrides.providerAccountId ?? 1;
		tx.asset = overrides.asset ?? "BTC";
		tx.type = overrides.type ?? TransactionType.buy;
		tx.quantity = overrides.quantity ?? 1.0;
		tx.eurValue = overrides.eurValue ?? 50000;
		tx.timestamp = overrides.timestamp ?? DateTime.utc();
		tx.eurFee = 0;
		tx.externalId = `tx-${Date.now()}-${Math.random()}`;
		tx.processed = true;
		tx.createdAt = DateTime.utc();
		tx.updatedAt = DateTime.utc();
		return dataSource.getRepository(TransactionEntity).save(tx);
	};

	describe("getPortfolioHistoryWithPrices", () => {
		it("should return history with prices for existing snapshots", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ date: yesterday, asset: "BTC", amount: 1.0 });
			await createPrice("BTC", 50000, yesterday);

			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });

			expect(result.length).toBeGreaterThanOrEqual(1);
			const yesterdayEntry = result.find((r) => r.date === yesterday.toISODate());
			expect(yesterdayEntry).toBeDefined();
			expect(yesterdayEntry?.assets["BTC"]).toEqual({ amount: 1.0, eurValue: 50000 });
			expect(yesterdayEntry?.totalEurValue).toBe(50000);
		});

		it("should include today's holdings calculated from transactions", async () => {
			const today = DateTime.utc().startOf("day");

			await createTransaction({
				asset: "BTC",
				type: TransactionType.buy,
				quantity: 1.0,
				eurValue: 50000,
				timestamp: today
			});
			await createPrice("BTC", 55000, today);

			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });

			const todayEntry = result.find((r) => r.date === today.toISODate());
			expect(todayEntry).toBeDefined();
			expect(todayEntry?.assets["BTC"]).toEqual({ amount: 1.0, eurValue: 55000 });
		});

		it("should exclude days when price is missing", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ date: yesterday, asset: "BTC", amount: 1.0 });

			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });

			expect(result.find((r) => r.date === yesterday.toISODate())).toBeUndefined();
		});

		it("should aggregate holdings from multiple accounts", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ providerAccountId: 1, date: yesterday, asset: "BTC", amount: 0.5 });
			await createSnapshot({ providerAccountId: 2, date: yesterday, asset: "BTC", amount: 0.5 });
			await createPrice("BTC", 50000, yesterday);

			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });

			const yesterdayEntry = result.find((r) => r.date === yesterday.toISODate());
			expect(yesterdayEntry).toBeDefined();
			expect(yesterdayEntry?.assets["BTC"]).toEqual({ amount: 1.0, eurValue: 50000 });
		});

		it("should work for specific account", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ providerAccountId: 1, date: yesterday, asset: "BTC", amount: 1.0 });
			await createSnapshot({ providerAccountId: 2, date: yesterday, asset: "ETH", amount: 2.0 });
			await createPrice("BTC", 50000, yesterday);

			const result = await service.getPortfolioHistoryWithPrices(1, 1, { days: 30 });

			expect(result.every((r) => !r.assets["ETH"])).toBe(true);
			const yesterdayEntry = result.find((r) => r.date === yesterday.toISODate());
			expect(yesterdayEntry?.assets["BTC"]).toEqual({ amount: 1.0, eurValue: 50000 });
		});

		it("should return empty array when no holdings exist", async () => {
			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });
			expect(result).toEqual([]);
		});

		it("should handle multiple assets on same day", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ date: yesterday, asset: "BTC", amount: 1.0 });
			await createSnapshot({ date: yesterday, asset: "ETH", amount: 10.0 });
			await createPrice("BTC", 50000, yesterday);
			await createPrice("ETH", 3000, yesterday);

			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });

			const yesterdayEntry = result.find((r) => r.date === yesterday.toISODate());
			expect(yesterdayEntry).toBeDefined();
			expect(yesterdayEntry?.assets["BTC"]).toEqual({ amount: 1.0, eurValue: 50000 });
			expect(yesterdayEntry?.assets["ETH"]).toEqual({ amount: 10.0, eurValue: 30000 });
			expect(yesterdayEntry?.totalEurValue).toBe(80000);
		});

		it("should only include snapshots within the date range", async () => {
			const today = DateTime.utc().startOf("day");
			const oldDate = today.minus({ days: 60 });

			await createSnapshot({ date: oldDate, asset: "BTC", amount: 1.0 });
			await createSnapshot({ date: today, asset: "BTC", amount: 2.0 });
			await createPrice("BTC", 50000, oldDate);
			await createPrice("BTC", 55000, today);

			const result = await service.getPortfolioHistoryWithPrices(1, undefined, { days: 30 });

			expect(result.find((r) => r.date === oldDate.toISODate())).toBeUndefined();
			expect(result.find((r) => r.date === today.toISODate())).toBeDefined();
		});
	});

	describe("getPortfolioOverview", () => {
		it("should return portfolio history and assets overview", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ date: yesterday, asset: "BTC", amount: 1.0 });
			await createPrice("BTC", 50000, yesterday);

			const result = await service.getPortfolioOverview(1, 30);

			expect(result.portfolioHistory.length).toBeGreaterThanOrEqual(1);
			expect(result.assets.length).toBeGreaterThanOrEqual(1);
			expect(result.assets[0].asset).toBe("BTC");
			expect(result.assets[0].priceHistory.length).toBeGreaterThanOrEqual(1);
		});

		it("should include price history for each asset", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");
			const today = DateTime.utc().startOf("day");

			await createSnapshot({ date: yesterday, asset: "BTC", amount: 1.0 });
			await createPrice("BTC", 50000, yesterday);
			await createPrice("BTC", 55000, today);

			const result = await service.getPortfolioOverview(1, 30);

			const btcAsset = result.assets.find((a) => a.asset === "BTC");
			expect(btcAsset).toBeDefined();
			expect(btcAsset?.priceHistory.length).toBeGreaterThanOrEqual(2);
		});

		it("should sort assets by eurValue descending", async () => {
			const yesterday = DateTime.utc().minus({ days: 1 }).startOf("day");

			await createSnapshot({ date: yesterday, asset: "BTC", amount: 1.0 });
			await createSnapshot({ date: yesterday, asset: "ETH", amount: 10.0 });
			await createPrice("BTC", 50000, yesterday);
			await createPrice("ETH", 3000, yesterday);

			const result = await service.getPortfolioOverview(1, 30);

			expect(result.assets.length).toBe(2);
			expect(result.assets[0].eurValue).toBeGreaterThanOrEqual(result.assets[1].eurValue!);
		});

		it("should return empty arrays when no holdings exist", async () => {
			const result = await service.getPortfolioOverview(1, 30);

			expect(result.portfolioHistory).toEqual([]);
			expect(result.assets).toEqual([]);
		});
	});
});
