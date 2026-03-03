import "reflect-metadata";
import { join } from "node:path";
import { DataSource } from "typeorm";
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { TransactionEntity, AccountEntity, TransactionType, TransactionsRepository } from "@txls/shared";
import { DateTime } from "luxon";

const __dirname = import.meta.dirname;

describe("TransactionsRepository Integration Tests", () => {
  let dataSource: DataSource;
  let repository: TransactionsRepository;

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    const connectionString = process.env.DB_CONNECTION_STRING;
    dataSource = new DataSource({
      type: "better-sqlite3",
      database: connectionString || join(__dirname, "data", "test-repo.db"),
      entities: [AccountEntity, TransactionEntity],
      synchronize: true,
      dropSchema: true,
    });

    await dataSource.initialize();
    repository = new TransactionsRepository(dataSource);
  });

  const createBaseEntity = (overrides: Partial<TransactionEntity> = {}) => {
    const entity = new TransactionEntity();
    entity.userId = 1;
    entity.providerAccountId = 1;
    entity.externalId = "TEST-001";
    entity.timestamp = DateTime.fromISO("2026-02-19T10:00:00Z");
    entity.type = TransactionType.buy;
    entity.asset = "BTC";
    entity.quantity = 0.5;
    entity.eurValue = 1000;
    entity.eurFee = 5;
    entity.processed = false;
    Object.assign(entity, overrides);
    return entity;
  };

  describe("findByProviderAccountId", () => {
    it("should find transactions by account id", async () => {
      const entity1 = createBaseEntity({ externalId: "TEST-001" });
      const entity2 = createBaseEntity({
        externalId: "TEST-002",
        timestamp: DateTime.fromISO("2026-02-19T11:00:00Z"),
      });
      const entity3 = createBaseEntity({
        userId: 2,
        providerAccountId: 2,
        externalId: "TEST-003",
      });

      await repository.saveMany([entity1, entity2, entity3]);

      const transactions = await repository.findByProviderAccountId(1, 1);

      expect(transactions).toHaveLength(2);
      expect(transactions.every((t) => t.providerAccountId === 1)).toBe(true);
      expect(transactions[0].externalId).toBe("TEST-002");
      expect(transactions[1].externalId).toBe("TEST-001");
    });

    it("should return empty array for account with no transactions", async () => {
      const transactions = await repository.findByProviderAccountId(1, 999);
      expect(transactions).toEqual([]);
    });
  });

  describe("findByProviderAccountIdAndYear", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "TEST-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "TEST-002",
          timestamp: DateTime.fromISO("2026-06-15T12:00:00Z"),
        }),
        createBaseEntity({
          externalId: "TEST-003",
          timestamp: DateTime.fromISO("2025-12-31T23:59:59Z"),
        }),
        createBaseEntity({
          externalId: "TEST-004",
          timestamp: DateTime.fromISO("2027-01-01T00:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should find transactions within a specific year", async () => {
      const transactions = await repository.findByProviderAccountIdAndYear(1, 1, 2026);

      expect(transactions).toHaveLength(2);
      expect(
        transactions.every((t) => t.timestamp.year === 2026),
      ).toBe(true);
    });

    it("should include transactions at year boundaries", async () => {
      const transactions = await repository.findByProviderAccountIdAndYear(1, 1, 2025);

      expect(transactions).toHaveLength(1);
      expect(transactions[0].externalId).toBe("TEST-003");
    });

    it("should return empty array for year with no transactions", async () => {
      const transactions = await repository.findByProviderAccountIdAndYear(1, 1, 2020);
      expect(transactions).toEqual([]);
    });
  });

  describe("findOneByExternalId", () => {
    it("should find transaction by external id", async () => {
      const entity = createBaseEntity({ externalId: "UNIQUE-001" });
      await repository.save(entity);

      const found = await repository.findOneByExternalId("UNIQUE-001");

      expect(found).toBeDefined();
      expect(found?.externalId).toBe("UNIQUE-001");
    });

    it("should return null for non-existent external id", async () => {
      const found = await repository.findOneByExternalId("NON-EXISTENT");
      expect(found).toBeNull();
    });
  });

  describe("save", () => {
    it("should save single transaction", async () => {
      const entity = createBaseEntity({ externalId: "SAVE-001" });
      const saved = await repository.save(entity);

      expect(saved).toBeDefined();
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.externalId).toBe("SAVE-001");
    });

    it("should auto-generate id", async () => {
      const entity1 = createBaseEntity({ externalId: "AUTO-1" });
      const entity2 = createBaseEntity({ externalId: "AUTO-2" });

      const saved1 = await repository.save(entity1);
      const saved2 = await repository.save(entity2);

      expect(saved1.id).toBeGreaterThan(0);
      expect(saved2.id).toBeGreaterThan(saved1.id);
    });
  });

  describe("saveMany", () => {
    it("should save multiple transactions", async () => {
      const entities = [
        createBaseEntity({ externalId: "BATCH-1" }),
        createBaseEntity({ externalId: "BATCH-2" }),
        createBaseEntity({ externalId: "BATCH-3" }),
      ];

      const saved = await repository.saveMany(entities);

      expect(saved).toHaveLength(3);
      expect(saved.every((t) => t.id > 0)).toBe(true);
    });
  });

  describe("countByProviderAccountId", () => {
    it("should count transactions by account id", async () => {
      const entities = [
        createBaseEntity({ externalId: "COUNT-1" }),
        createBaseEntity({ externalId: "COUNT-2" }),
        createBaseEntity({ userId: 2, providerAccountId: 2, externalId: "COUNT-3" }),
      ];

      await repository.saveMany(entities);

      const count = await repository.countByProviderAccountId(1, 1);

      expect(count).toBe(2);
    });

    it("should return 0 for account with no transactions", async () => {
      const count = await repository.countByProviderAccountId(1, 999);
      expect(count).toBe(0);
    });
  });

  describe("countByProviderAccountIdAndYear", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "COUNTYR-1",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "COUNTYR-2",
          timestamp: DateTime.fromISO("2026-06-15T12:00:00Z"),
        }),
        createBaseEntity({
          externalId: "COUNTYR-3",
          timestamp: DateTime.fromISO("2025-12-31T23:59:59Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should count transactions by account and year", async () => {
      const count = await repository.countByProviderAccountIdAndYear(1, 1, 2026);
      expect(count).toBe(2);
    });

    it("should return 0 for year with no transactions", async () => {
      const count = await repository.countByProviderAccountIdAndYear(1, 1, 2020);
      expect(count).toBe(0);
    });
  });

  describe("findByProviderAccountIdAndType", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "TYPE-1",
          type: TransactionType.buy,
        }),
        createBaseEntity({
          externalId: "TYPE-2",
          type: TransactionType.sell,
          timestamp: DateTime.fromISO("2026-02-19T11:00:00Z"),
        }),
        createBaseEntity({
          externalId: "TYPE-3",
          type: TransactionType.buy,
          timestamp: DateTime.fromISO("2026-02-19T12:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should find transactions by account and type", async () => {
      const transactions = await repository.findByProviderAccountIdAndType(
        1,
        1,
        TransactionType.buy,
      );

      expect(transactions).toHaveLength(2);
      expect(transactions.every((t) => t.type === TransactionType.buy)).toBe(
        true,
      );
    });

    it("should return empty array for non-matching type", async () => {
      const transactions = await repository.findByProviderAccountIdAndType(
        1,
        1,
        TransactionType.reward,
      );

      expect(transactions).toEqual([]);
    });
  });

  describe("getStatsByProviderAccountIdAndYear", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "STATS-1",
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 0.5,
          eurValue: 1000,
          timestamp: DateTime.fromISO("2026-02-19T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "STATS-2",
          type: TransactionType.sell,
          asset: "BTC",
          quantity: 0.25,
          eurValue: 500,
          timestamp: DateTime.fromISO("2026-06-15T12:00:00Z"),
        }),
        createBaseEntity({
          externalId: "STATS-3",
          type: TransactionType.reward,
          asset: "SOL",
          quantity: 0.1,
          eurValue: 25,
          timestamp: DateTime.fromISO("2026-02-20T09:00:00Z"),
        }),
        createBaseEntity({
          externalId: "STATS-4",
          type: TransactionType.buy,
          asset: "ETH",
          quantity: 1.0,
          eurValue: 2000,
          timestamp: DateTime.fromISO("2026-07-01T14:00:00Z"),
        }),
        createBaseEntity({
          externalId: "STATS-5",
          type: TransactionType.buy,
          asset: "ETH",
          quantity: 0.5,
          eurValue: 1000,
          timestamp: DateTime.fromISO("2025-02-19T10:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should calculate correct year stats", async () => {
      const stats = await repository.getStatsByProviderAccountIdAndYear(1, 1, 2026);

      expect(stats.year).toBe(2026);
      expect(stats.buys.count).toBe(2);
      expect(stats.sells.count).toBe(1);
      expect(stats.staking.fiatAmount).toBe(25);
    });

    it("should calculate asset stats correctly", async () => {
      const stats = await repository.getStatsByProviderAccountIdAndYear(1, 1, 2026);

      const btcStats = stats.assetStats.find((s) => s.asset === "BTC");
      const ethStats = stats.assetStats.find((s) => s.asset === "ETH");
      const solStats = stats.assetStats.find((s) => s.asset === "SOL");

      expect(btcStats).toBeDefined();
      expect(btcStats?.buys).toBe(1);
      expect(btcStats?.sells).toBe(1);
      expect(btcStats?.amount).toBeCloseTo(0.25, 2);

      expect(ethStats).toBeDefined();
      expect(ethStats?.buys).toBe(1);
      expect(ethStats?.sells).toBe(0);
      expect(ethStats?.amount).toBe(1.0);

      expect(solStats).toBeDefined();
      expect(solStats?.buys).toBe(0);
      expect(solStats?.sells).toBe(0);
      expect(solStats?.amount).toBe(0.1);
    });

    it("should not include transactions from other years", async () => {
      const stats = await repository.getStatsByProviderAccountIdAndYear(1, 1, 2026);

      expect(stats.buys.count).toBe(2);
      expect(stats.assetStats.find((s) => s.asset === "ETH")?.buys).toBe(1);
    });

    it("should return zero stats for year with no transactions", async () => {
      const stats = await repository.getStatsByProviderAccountIdAndYear(1, 1, 2020);

      expect(stats.year).toBe(2020);
      expect(stats.buys.count).toBe(0);
      expect(stats.sells.count).toBe(0);
      expect(stats.staking.fiatAmount).toBe(0);
      expect(stats.assetStats).toEqual([]);
    });
  });

  describe("existsByExternalId", () => {
    beforeEach(async () => {
      const entity = createBaseEntity({ externalId: "EXISTS-001" });
      await repository.save(entity);
    });

    it("should return true for existing external id", async () => {
      const exists = await repository.existsByExternalId("EXISTS-001");
      expect(exists).toBe(true);
    });

    it("should return false for non-existent external id", async () => {
      const exists = await repository.existsByExternalId("NON-EXISTENT");
      expect(exists).toBe(false);
    });
  });

  describe("findManyByExternalIds", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({ externalId: "FIND-1" }),
        createBaseEntity({ externalId: "FIND-2" }),
        createBaseEntity({ externalId: "FIND-3" }),
      ];

      await repository.saveMany(transactions);
    });

    it("should find multiple transactions by external ids", async () => {
      const transactions = await repository.findManyByExternalIds([
        "FIND-1",
        "FIND-2",
      ]);

      expect(transactions).toHaveLength(2);
      const externalIds = transactions.map((t) => t.externalId).sort();
      expect(externalIds).toEqual(["FIND-1", "FIND-2"]);
    });

    it("should return empty array for empty input", async () => {
      const transactions = await repository.findManyByExternalIds([]);
      expect(transactions).toEqual([]);
    });

    it("should return only existing transactions", async () => {
      const transactions = await repository.findManyByExternalIds([
        "FIND-1",
        "NON-EXISTENT",
        "FIND-3",
      ]);

      expect(transactions).toHaveLength(2);
      expect(transactions.every((t) => t.externalId.includes("FIND"))).toBe(
        true,
      );
    });
  });

  describe("getAvailableYears", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "YEAR-2024-1",
          timestamp: DateTime.fromISO("2024-06-15T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "YEAR-2024-2",
          timestamp: DateTime.fromISO("2024-12-31T23:59:59Z"),
        }),
        createBaseEntity({
          externalId: "YEAR-2025-1",
          timestamp: DateTime.fromISO("2025-03-10T14:00:00Z"),
        }),
        createBaseEntity({
          externalId: "YEAR-2025-2",
          timestamp: DateTime.fromISO("2025-08-20T09:00:00Z"),
        }),
        createBaseEntity({
          externalId: "YEAR-2026-1",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00Z"),
        }),
        createBaseEntity({
          userId: 2,
          providerAccountId: 2,
          externalId: "YEAR-2025-3",
          timestamp: DateTime.fromISO("2025-05-01T11:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should return all distinct years for an account", async () => {
      const years = await repository.getAvailableYears(1, 1);

      expect(years).toHaveLength(3);
      expect(years).toContain(2024);
      expect(years).toContain(2025);
      expect(years).toContain(2026);
    });

    it("should only return years for the specified account", async () => {
      const years = await repository.getAvailableYears(2, 2);

      expect(years).toHaveLength(1);
      expect(years).toEqual([2025]);
    });

    it("should return empty array for account with no transactions", async () => {
      const years = await repository.getAvailableYears(1, 999);

      expect(years).toEqual([]);
    });

    it("should handle transactions at year boundaries correctly", async () => {
      const years = await repository.getAvailableYears(1, 1);

      expect(years).toContain(2024);
      expect(years).toContain(2026);
    });
  });

  describe("getAssetSummaryByProviderAccountId", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "ASSET-1",
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 1.5,
          eurValue: 3000,
          timestamp: DateTime.fromISO("2024-06-15T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "ASSET-2",
          type: TransactionType.sell,
          asset: "BTC",
          quantity: 0.5,
          eurValue: 1000,
          timestamp: DateTime.fromISO("2024-08-20T14:00:00Z"),
        }),
        createBaseEntity({
          externalId: "ASSET-3",
          type: TransactionType.buy,
          asset: "ETH",
          quantity: 2.0,
          eurValue: 4000,
          timestamp: DateTime.fromISO("2024-09-10T09:00:00Z"),
        }),
        createBaseEntity({
          externalId: "ASSET-4",
          type: TransactionType.buy,
          asset: "SOL",
          quantity: 10.0,
          eurValue: 500,
          timestamp: DateTime.fromISO("2024-10-05T11:00:00Z"),
        }),
        createBaseEntity({
          userId: 2,
          providerAccountId: 2,
          externalId: "ASSET-5",
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 1.0,
          eurValue: 2000,
          timestamp: DateTime.fromISO("2024-07-01T12:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should return asset summary for account", async () => {
      const summary = await repository.getAssetSummaryByProviderAccountId(1, 1);

      expect(summary).toHaveLength(3);

      const btc = summary.find((a) => a.asset === "BTC");
      const eth = summary.find((a) => a.asset === "ETH");
      const sol = summary.find((a) => a.asset === "SOL");

      expect(btc).toBeDefined();
      expect(btc?.amount).toBeCloseTo(1.0, 2);
      expect(btc?.buys).toBe(1);
      expect(btc?.sells).toBe(1);

      expect(eth).toBeDefined();
      expect(eth?.amount).toBe(2.0);
      expect(eth?.buys).toBe(1);
      expect(eth?.sells).toBe(0);

      expect(sol).toBeDefined();
      expect(sol?.amount).toBe(10.0);
      expect(sol?.buys).toBe(1);
      expect(sol?.sells).toBe(0);
    });

    it("should exclude assets with zero balance", async () => {
      const transactions = [
        createBaseEntity({
          externalId: "ZERO-1",
          type: TransactionType.buy,
          asset: "ADA",
          quantity: 1.0,
          eurValue: 100,
          timestamp: DateTime.fromISO("2024-01-01T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "ZERO-2",
          type: TransactionType.sell,
          asset: "ADA",
          quantity: 1.0,
          eurValue: 100,
          timestamp: DateTime.fromISO("2024-01-02T10:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);

      const summary = await repository.getAssetSummaryByProviderAccountId(1, 1);
      const ada = summary.find((a) => a.asset === "ADA");

      expect(ada).toBeUndefined();
    });

    it("should return empty array for account with no transactions", async () => {
      const summary = await repository.getAssetSummaryByProviderAccountId(1, 999);
      expect(summary).toEqual([]);
    });

    it("should only return assets for the specified account", async () => {
      const summary = await repository.getAssetSummaryByProviderAccountId(2, 2);

      expect(summary).toHaveLength(1);
      expect(summary[0].asset).toBe("BTC");
      expect(summary[0].amount).toBeCloseTo(1.0, 2);
    });
  });

  describe("getAllAssetSummaries", () => {
    beforeEach(async () => {
      const transactions = [
        createBaseEntity({
          externalId: "ALL-1",
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 1.5,
          eurValue: 3000,
          timestamp: DateTime.fromISO("2024-06-15T10:00:00Z"),
        }),
        createBaseEntity({
          externalId: "ALL-2",
          type: TransactionType.sell,
          asset: "BTC",
          quantity: 0.5,
          eurValue: 1000,
          timestamp: DateTime.fromISO("2024-08-20T14:00:00Z"),
        }),
        createBaseEntity({
          userId: 2,
          providerAccountId: 2,
          externalId: "ALL-3",
          type: TransactionType.buy,
          asset: "ETH",
          quantity: 2.0,
          eurValue: 4000,
          timestamp: DateTime.fromISO("2024-09-10T09:00:00Z"),
        }),
        createBaseEntity({
          userId: 1,
          providerAccountId: 3,
          externalId: "ALL-4",
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 1.0,
          eurValue: 2000,
          timestamp: DateTime.fromISO("2024-10-05T11:00:00Z"),
        }),
        createBaseEntity({
          userId: 1,
          providerAccountId: 3,
          externalId: "ALL-5",
          type: TransactionType.buy,
          asset: "SOL",
          quantity: 10.0,
          eurValue: 500,
          timestamp: DateTime.fromISO("2024-11-01T12:00:00Z"),
        }),
      ];

      await repository.saveMany(transactions);
    });

    it("should return asset summaries for all accounts", async () => {
      const summaries = await repository.getAllAssetSummaries();

      expect(summaries.size).toBe(3);
      expect(summaries.has(1)).toBe(true);
      expect(summaries.has(2)).toBe(true);
      expect(summaries.has(3)).toBe(true);
    });

    it("should have correct asset counts per account", async () => {
      const summaries = await repository.getAllAssetSummaries();

      expect(summaries.get(1)).toHaveLength(1);
      expect(summaries.get(2)).toHaveLength(1);
      expect(summaries.get(3)).toHaveLength(2);
    });

    it("should calculate correct balances for all accounts", async () => {
      const summaries = await repository.getAllAssetSummaries();

      const account1Btc = summaries.get(1)?.find((a) => a.asset === "BTC");
      const account2Eth = summaries.get(2)?.find((a) => a.asset === "ETH");
      const account3Btc = summaries.get(3)?.find((a) => a.asset === "BTC");
      const account3Sol = summaries.get(3)?.find((a) => a.asset === "SOL");

      expect(account1Btc?.amount).toBeCloseTo(1.0, 2);
      expect(account2Eth?.amount).toBe(2.0);
      expect(account3Btc?.amount).toBeCloseTo(1.0, 2);
      expect(account3Sol?.amount).toBe(10.0);
    });

    it("should exclude accounts with no transactions", async () => {
      const summaries = await repository.getAllAssetSummaries();

      expect(summaries.has(999)).toBe(false);
    });

    it("should return empty map when no transactions exist", async () => {
      await dataSource.getRepository(TransactionEntity).clear();

      const summaries = await repository.getAllAssetSummaries();

      expect(summaries.size).toBe(0);
    });
  });
});
