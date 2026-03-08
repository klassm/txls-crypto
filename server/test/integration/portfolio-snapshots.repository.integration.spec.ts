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

  const createBaseEntity = (overrides: Partial<PortfolioSnapshotEntity> = {}): PortfolioSnapshotEntity => {
    const entity = new PortfolioSnapshotEntity();
    entity.userId = 1;
    entity.providerAccountId = 1;
    entity.asset = "BTC";
    entity.year = 2024;
    entity.month = 6;
    entity.amount = 1.5;
    entity.eurInvested = 50000;
    entity.buyCount = 2;
    entity.sellCount = 0;
    entity.createdAt = DateTime.now();
    entity.updatedAt = DateTime.now();
    Object.assign(entity, overrides);
    return entity;
  };

  describe("findLatestByAccount", () => {
    it("should return latest snapshot for each asset", async () => {
      const snapshots = [
        createBaseEntity({ asset: "BTC", year: 2024, month: 6, amount: 1.5 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 5, amount: 1.0 }),
        createBaseEntity({ asset: "ETH", year: 2024, month: 6, amount: 2.0 }),
      ];

      await repository.saveMany(snapshots);

      const result = await repository.findLatestByAccount(1, 1);

      expect(result).toHaveLength(2);
      const btc = result.find((s) => s.asset === "BTC");
      const eth = result.find((s) => s.asset === "ETH");
      expect(btc?.month).toBe(6);
      expect(btc?.amount).toBe(1.5);
      expect(eth?.month).toBe(6);
    });

    it("should return empty array for account with no snapshots", async () => {
      const result = await repository.findLatestByAccount(1, 999);
      expect(result).toEqual([]);
    });

    it("should only return snapshots for specified account", async () => {
      const snapshots = [
        createBaseEntity({ providerAccountId: 1, asset: "BTC", year: 2024, month: 6 }),
        createBaseEntity({ userId: 1, providerAccountId: 2, asset: "ETH", year: 2024, month: 6 }),
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
        createBaseEntity({ providerAccountId: 1, asset: "BTC", year: 2024, month: 6 }),
        createBaseEntity({ userId: 1, providerAccountId: 2, asset: "ETH", year: 2024, month: 5 }),
        createBaseEntity({ userId: 1, providerAccountId: 2, asset: "ETH", year: 2024, month: 6 }),
      ];

      await repository.saveMany(snapshots);

      const result = await repository.findLatestByUser(1);

      expect(result.size).toBe(2);
      expect(result.get(1)).toHaveLength(1);
      expect(result.get(2)).toHaveLength(1);
      expect(result.get(2)?.[0].month).toBe(6);
    });

    it("should return empty map when no snapshots exist", async () => {
      const result = await repository.findLatestByUser(999);
      expect(result.size).toBe(0);
    });

    it("should only return snapshots for specified user", async () => {
      const snapshots = [
        createBaseEntity({ userId: 1, providerAccountId: 1, asset: "BTC", year: 2024, month: 6 }),
        createBaseEntity({ userId: 2, providerAccountId: 1, asset: "ETH", year: 2024, month: 6 }),
      ];

      await repository.saveMany(snapshots);

      const result = await repository.findLatestByUser(1);

      expect(result.size).toBe(1);
      expect(result.get(1)).toHaveLength(1);
      expect(result.get(1)?.[0].asset).toBe("BTC");
    });
  });

  describe("deleteByAccountAndDateRange", () => {
    it("should delete snapshots from the given month onward", async () => {
      const snapshots = [
        createBaseEntity({ asset: "BTC", year: 2024, month: 4 }),
        createBaseEntity({ asset: "ETH", year: 2024, month: 5 }),
        createBaseEntity({ asset: "SOL", year: 2024, month: 6 }),
      ];

      await repository.saveMany(snapshots);

      await repository.deleteByAccountAndDateRange(1, 1, 2024, 5);

      const remaining = await repository.findLatestByAccount(1, 1);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].asset).toBe("BTC");
      expect(remaining[0].month).toBe(4);
    });

    it("should delete across year boundaries", async () => {
      const snapshots = [
        createBaseEntity({ asset: "BTC", year: 2023, month: 12 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 1 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 2 }),
      ];

      await repository.saveMany(snapshots);

      await repository.deleteByAccountAndDateRange(1, 1, 2024, 1);

      const remaining = await repository.findLatestByAccount(1, 1);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].month).toBe(12);
      expect(remaining[0].year).toBe(2023);
    });

    it("should not delete snapshots for other accounts", async () => {
      const snapshots = [
        createBaseEntity({ providerAccountId: 1, asset: "BTC", year: 2024, month: 6 }),
        createBaseEntity({ userId: 1, providerAccountId: 2, asset: "BTC", year: 2024, month: 6 }),
      ];

      await repository.saveMany(snapshots);

      await repository.deleteByAccountAndDateRange(1, 1, 2024, 1);

      const remaining = await repository.findLatestByAccount(1, 2);
      expect(remaining).toHaveLength(1);
    });
  });

  describe("findByAccountAndDateRange", () => {
    it("should return snapshots from the given month onward", async () => {
      const snapshots = [
        createBaseEntity({ asset: "BTC", year: 2024, month: 4 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 5 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 6 }),
      ];

      await repository.saveMany(snapshots);

      const result = await repository.findByAccountAndDateRange(1, 1, 2024, 5);

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.month >= 5)).toBe(true);
    });

    it("should return snapshots across year boundaries", async () => {
      const snapshots = [
        createBaseEntity({ asset: "BTC", year: 2023, month: 12 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 1 }),
        createBaseEntity({ asset: "BTC", year: 2024, month: 2 }),
      ];

      await repository.saveMany(snapshots);

      const result = await repository.findByAccountAndDateRange(1, 1, 2024, 1);

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.year >= 2024)).toBe(true);
    });

    it("should return empty array for account with no matching snapshots", async () => {
      const result = await repository.findByAccountAndDateRange(1, 999, 2024, 1);
      expect(result).toEqual([]);
    });

    it("should only return snapshots for specified account", async () => {
      const snapshots = [
        createBaseEntity({ providerAccountId: 1, asset: "BTC", year: 2024, month: 6 }),
        createBaseEntity({ userId: 1, providerAccountId: 2, asset: "BTC", year: 2024, month: 6 }),
      ];

      await repository.saveMany(snapshots);

      const result = await repository.findByAccountAndDateRange(1, 1, 2024, 1);

      expect(result).toHaveLength(1);
      expect(result[0].providerAccountId).toBe(1);
    });
  });

  describe("save", () => {
    it("should save a single snapshot", async () => {
      const data = {
        userId: 1,
        providerAccountId: 1,
        asset: "BTC",
        year: 2024,
        month: 6,
        amount: 1.5,
        eurInvested: 50000,
        buyCount: 2,
        sellCount: 0,
      };

      const saved = await repository.save(data);

      expect(saved.id).toBeGreaterThan(0);
      expect(saved.asset).toBe("BTC");
      expect(saved.amount).toBe(1.5);
    });

    it("should enforce unique constraint on user/account/asset/year/month", async () => {
      const data = {
        userId: 1,
        providerAccountId: 1,
        asset: "BTC",
        year: 2024,
        month: 6,
        amount: 1.5,
        eurInvested: 50000,
        buyCount: 2,
        sellCount: 0,
      };

      await repository.save(data);

      await expect(repository.save(data)).rejects.toThrow();
    });
  });

  describe("saveMany", () => {
    it("should save multiple snapshots", async () => {
      const data = [
        { userId: 1, providerAccountId: 1, asset: "BTC", year: 2024, month: 6, amount: 1.5, eurInvested: 50000, buyCount: 2, sellCount: 0 },
        { userId: 1, providerAccountId: 1, asset: "ETH", year: 2024, month: 6, amount: 2.0, eurInvested: 4000, buyCount: 1, sellCount: 0 },
      ];

      const saved = await repository.saveMany(data);

      expect(saved).toHaveLength(2);
      expect(saved.every((s) => s.id > 0)).toBe(true);
    });
  });

  describe("deleteByAccount", () => {
    it("should delete all snapshots for an account", async () => {
      const snapshots = [
        createBaseEntity({ providerAccountId: 1, asset: "BTC", year: 2024, month: 1 }),
        createBaseEntity({ providerAccountId: 1, asset: "BTC", year: 2024, month: 2 }),
        createBaseEntity({ providerAccountId: 1, asset: "ETH", year: 2024, month: 1 }),
        createBaseEntity({ userId: 1, providerAccountId: 2, asset: "BTC", year: 2024, month: 1 }),
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
