import "reflect-metadata";
import { join } from "node:path";
import { DataSource } from "typeorm";
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { PortfolioSnapshotEntity } from "../../src/modules/portfolio-snapshots/portfolio-snapshot.entity.js";
import { PortfolioSnapshotsRepository } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.repository.js";
import { DateTime } from "luxon";

const __dirname = import.meta.dirname;

describe("PortfolioSnapshotsRepository Integration Tests", () => {
	let dataSource: DataSource;
	let repository: PortfolioSnapshotsRepository;

	afterAll(async () => {
		if (dataSource && dataSource.isInitialized) {
			await dataSource.destroy();
		}
	});

	beforeEach(async () => {
		const connectionString = process.env.DB_CONNECTION_STRING;
		dataSource = new DataSource({
			type: "better-sqlite3",
			database: connectionString || join(__dirname, "data", "test-snapshot-repo.db"),
			entities: [PortfolioSnapshotEntity],
			synchronize: true,
			dropSchema: true,
		});

		await dataSource.initialize();
		repository = new PortfolioSnapshotsRepository(dataSource);
	});

	const createBaseData = (overrides: Partial<{ userId: number; providerAccountId: number; asset: string; date: DateTime; amount: number; eurInvested: number; buyCount: number; sellCount: number }> = {}) => ({
		userId: 1,
		providerAccountId: 1,
		asset: "BTC",
		date: DateTime.utc(2024, 6, 15),
		amount: 1.5,
		eurInvested: 50000,
		buyCount: 2,
		sellCount: 0,
		...overrides,
	});

	describe("findLatestByAccount", () => {
		it("should return latest snapshot for each asset", async () => {
			const snapshots = [
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 15), amount: 1.5 }),
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 1), amount: 1.0 }),
				createBaseData({ asset: "ETH", date: DateTime.utc(2024, 6, 15), amount: 2.0 }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findLatestByAccount(1, 1);

			expect(result).toHaveLength(2);
			const btc = result.find((s) => s.asset === "BTC");
			const eth = result.find((s) => s.asset === "ETH");
			expect(btc?.date.toISODate()).toBe("2024-06-15");
			expect(btc?.amount).toBe(1.5);
			expect(eth?.date.toISODate()).toBe("2024-06-15");
		});

		it("should return empty array for account with no snapshots", async () => {
			const result = await repository.findLatestByAccount(1, 999);
			expect(result).toEqual([]);
		});

		it("should only return snapshots for specified account", async () => {
			const snapshots = [
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ providerAccountId: 2, asset: "ETH", date: DateTime.utc(2024, 6, 15) }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findLatestByAccount(1, 1);

			expect(result).toHaveLength(1);
			expect(result[0].asset).toBe("BTC");
		});
	});

	describe("findLatestByUser", () => {
		it("should return latest snapshots grouped by account", async () => {
			const snapshots = [
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ providerAccountId: 2, asset: "ETH", date: DateTime.utc(2024, 6, 1) }),
				createBaseData({ providerAccountId: 2, asset: "ETH", date: DateTime.utc(2024, 6, 15) }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findLatestByUser(1);

			expect(result.size).toBe(2);
			expect(result.get(1)).toHaveLength(1);
			expect(result.get(2)).toHaveLength(1);
			expect(result.get(2)?.[0].date.toISODate()).toBe("2024-06-15");
		});

		it("should return empty map when no snapshots exist", async () => {
			const result = await repository.findLatestByUser(999);
			expect(result.size).toBe(0);
		});

		it("should only return snapshots for specified user", async () => {
			const snapshots = [
				createBaseData({ userId: 1, providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ userId: 2, providerAccountId: 1, asset: "ETH", date: DateTime.utc(2024, 6, 15) }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findLatestByUser(1);

			expect(result.size).toBe(1);
			expect(result.get(1)).toHaveLength(1);
			expect(result.get(1)?.[0].asset).toBe("BTC");
		});
	});

	describe("findByAccountAndDateRange", () => {
		it("should return snapshots within date range", async () => {
			const snapshots = [
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 1) }),
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 10) }),
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 20) }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findByAccountAndDateRange(
				1,
				1,
				DateTime.utc(2024, 6, 5),
				DateTime.utc(2024, 6, 15)
			);

			expect(result).toHaveLength(1);
			expect(result[0].date.toISODate()).toBe("2024-06-10");
		});

		it("should return empty array for account with no matching snapshots", async () => {
			const result = await repository.findByAccountAndDateRange(
				1,
				999,
				DateTime.utc(2024, 6, 1),
				DateTime.utc(2024, 6, 30)
			);
			expect(result).toEqual([]);
		});

		it("should only return snapshots for specified account", async () => {
			const snapshots = [
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ providerAccountId: 2, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findByAccountAndDateRange(
				1,
				1,
				DateTime.utc(2024, 6, 1),
				DateTime.utc(2024, 6, 30)
			);

			expect(result).toHaveLength(1);
			expect(result[0].providerAccountId).toBe(1);
		});
	});

	describe("findByUserAndDateRange", () => {
		it("should return all user snapshots within date range", async () => {
			const snapshots = [
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 10) }),
				createBaseData({ providerAccountId: 2, asset: "ETH", date: DateTime.utc(2024, 6, 15) }),
			];

			await repository.saveMany(snapshots);

			const result = await repository.findByUserAndDateRange(
				1,
				DateTime.utc(2024, 6, 1),
				DateTime.utc(2024, 6, 30)
			);

			expect(result).toHaveLength(2);
		});
	});

	describe("deleteByAccountAndDateRange", () => {
		it("should delete snapshots from the given date onward", async () => {
			const snapshots = [
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 1) }),
				createBaseData({ asset: "ETH", date: DateTime.utc(2024, 6, 10) }),
				createBaseData({ asset: "SOL", date: DateTime.utc(2024, 6, 20) }),
			];

			await repository.saveMany(snapshots);

			await repository.deleteByAccountAndDateRange(1, 1, DateTime.utc(2024, 6, 10));

			const remaining = await repository.findLatestByAccount(1, 1);
			expect(remaining).toHaveLength(1);
			expect(remaining[0].asset).toBe("BTC");
			expect(remaining[0].date.toISODate()).toBe("2024-06-01");
		});

		it("should not delete snapshots for other accounts", async () => {
			const snapshots = [
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ providerAccountId: 2, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
			];

			await repository.saveMany(snapshots);

			await repository.deleteByAccountAndDateRange(1, 1, DateTime.utc(2024, 6, 1));

			const remaining = await repository.findLatestByAccount(1, 2);
			expect(remaining).toHaveLength(1);
		});
	});

	describe("save", () => {
		it("should save a single snapshot", async () => {
			const data = createBaseData();

			const saved = await repository.save(data);

			expect(saved.id).toBeGreaterThan(0);
			expect(saved.asset).toBe("BTC");
			expect(saved.amount).toBe(1.5);
		});

		it("should enforce unique constraint on user/account/asset/date", async () => {
			const data = createBaseData();

			await repository.save(data);

			await expect(repository.save(data)).rejects.toThrow();
		});
	});

	describe("saveMany", () => {
		it("should save multiple snapshots", async () => {
			const data = [
				createBaseData({ asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ asset: "ETH", date: DateTime.utc(2024, 6, 15) }),
			];

			const saved = await repository.saveMany(data);

			expect(saved).toHaveLength(2);
			expect(saved.every((s) => s.id > 0)).toBe(true);
		});
	});

	describe("deleteByAccount", () => {
		it("should delete all snapshots for an account", async () => {
			const snapshots = [
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 1) }),
				createBaseData({ providerAccountId: 1, asset: "BTC", date: DateTime.utc(2024, 6, 15) }),
				createBaseData({ providerAccountId: 1, asset: "ETH", date: DateTime.utc(2024, 6, 1) }),
				createBaseData({ providerAccountId: 2, asset: "BTC", date: DateTime.utc(2024, 6, 1) }),
			];

			await repository.saveMany(snapshots);

			await repository.deleteByAccount(1, 1);

			const remaining = await repository.findLatestByAccount(1, 1);
			expect(remaining).toHaveLength(0);

			const otherAccount = await repository.findLatestByAccount(1, 2);
			expect(otherAccount).toHaveLength(1);
		});
	});
});
