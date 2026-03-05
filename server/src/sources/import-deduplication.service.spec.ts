import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DataSource } from "typeorm";
import { ImportDeduplicationService } from "./import-deduplication.service.js";
import { TransactionEntity } from "../modules/transactions/transaction.entity.js";
import { TransactionType } from "@txls/shared";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ImportDeduplicationService", () => {
  let dataSource: DataSource;
  let deduplicationService: ImportDeduplicationService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: "better-sqlite3",
      database: join(__dirname, "../../data/test-dedup.db"),
      entities: [TransactionEntity],
      synchronize: true,
      dropSchema: true,
    });

    await dataSource.initialize();
    deduplicationService = new ImportDeduplicationService(dataSource);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  const createBaseTransactions = (accountId: number): any[] => [
    {
      userId: 1,
      providerAccountId: accountId,
      externalId: "TEST-001",
      timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
      type: TransactionType.buy,
      asset: "BTC",
      quantity: 0.5,
      eurValue: 1000,
      eurFee: 5,
      processed: false,
    },
    {
      userId: 1,
      providerAccountId: accountId,
      externalId: "TEST-002",
      timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
      type: TransactionType.sell,
      asset: "BTC",
      quantity: 0.25,
      eurValue: 500,
      eurFee: 2,
      processed: false,
    },
    {
      userId: 1,
      providerAccountId: accountId,
      externalId: "TEST-003",
      timestamp: DateTime.fromISO("2026-02-19T12:00:00.000Z"),
      type: TransactionType.buy,
      asset: "ETH",
      quantity: 1.0,
      eurValue: 2000,
      eurFee: 10,
      processed: false,
    },
  ];

  describe("shouldSkipOrReplace", () => {
    it("should skip when no transactions to import", async () => {
      const result = await deduplicationService.shouldSkipOrReplace(1, []);

      expect(result.shouldSkip).toBe(true);
      expect(result.count).toBe(0);
    });

    it("should import when no existing transactions in range", async () => {
      const transactions = createBaseTransactions(1);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(0);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(0);
    });

    it("should skip when data matches exactly", async () => {
      const transactions = createBaseTransactions(1);
      const repository = dataSource.getRepository(TransactionEntity);

      await repository.save(transactions);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBe(3500);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(3);
    });

    it("should replace when sum differs", async () => {
      const existingTransactions = createBaseTransactions(1);
      existingTransactions[0].eurValue = 1100;
      existingTransactions[1].eurValue = 600;
      existingTransactions[2].eurValue = 2100;

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save(existingTransactions);

      const newTransactions = createBaseTransactions(1);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        newTransactions,
      );

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(3800);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(3);

      const remaining = await repository.count({ where: { providerAccountId: 1 } });
      expect(remaining).toBe(0);
    });

    it("should replace when count differs but sum matches", async () => {
      const existingTransactions = createBaseTransactions(1);
      const extraTransaction: any = {
        userId: 1,
        providerAccountId: 1,
        externalId: "TEST-004",
        timestamp: DateTime.fromISO("2026-02-19T10:30:00.000Z"),
        type: TransactionType.sell,
        asset: "BTC",
        quantity: 0.1,
        eurValue: 200,
        eurFee: 1,
        processed: false,
      };

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save([...existingTransactions, extraTransaction]);

      const newTransactions = createBaseTransactions(1);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        newTransactions,
      );

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(3700);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(4);

      const remaining = await repository.count({ where: { providerAccountId: 1 } });
      expect(remaining).toBe(0);
    });

    it("should respect accountId isolation", async () => {
      const account1Transactions = createBaseTransactions(1);
      const account2Transactions = createBaseTransactions(2).map((t, i) => ({
        ...t,
        providerAccountId: 2,
        externalId: `ACC2-${t.externalId}`,
      }));

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save(account1Transactions);
      await repository.save(account2Transactions);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        account1Transactions,
      );

expect(result.shouldSkip).toBe(true);

      const account1Remaining = await repository.count({
        where: { providerAccountId: 1 },
      });
      const account2Remaining = await repository.count({
        where: { providerAccountId: 2 },
      });

      expect(account1Remaining).toBe(3);
      expect(account2Remaining).toBe(3);
    });

    it("should only remove transactions in the import range", async () => {
      const account1Transactions = createBaseTransactions(1);
      const outsideRangeTransaction: any = {
        userId: 1,
        providerAccountId: 1,
        externalId: "TEST-OUTSIDE",
        timestamp: DateTime.fromISO("2026-02-18T10:00:00.000Z"),
        type: TransactionType.buy,
        asset: "SOL",
        quantity: 1.0,
        eurValue: 150,
        eurFee: 1,
        processed: false,
      };

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save([...account1Transactions, outsideRangeTransaction]);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        account1Transactions,
      );

expect(result.shouldSkip).toBe(true);

      const remaining = await repository.count({ where: { providerAccountId: 1 } });
      expect(remaining).toBe(4);

      const outsideTx = await repository.findOne({
        where: { externalId: "TEST-OUTSIDE" },
      });
      expect(outsideTx).toBeDefined();
    });

    it("should handle transactions with negative values (sells)", async () => {
      const transactions: any[] = [
        {
          userId: 1,
          providerAccountId: 1,
          externalId: "SELL-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
          type: TransactionType.sell,
          asset: "BTC",
          quantity: 0.5,
          eurValue: -1000,
          eurFee: 5,
          processed: false,
        },
        {
          userId: 1,
          providerAccountId: 1,
          externalId: "SELL-002",
          timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
          type: TransactionType.sell,
          asset: "ETH",
          quantity: 1.0,
          eurValue: -2000,
          eurFee: 10,
          processed: false,
        },
      ];

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save(transactions);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBe(3000);
      expect(result.newSum).toBe(3000);
    });

    it("should handle reward transactions (zero eurValue)", async () => {
      const transactions: any[] = [
        {
          userId: 1,
          providerAccountId: 1,
          externalId: "REWARD-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
          type: TransactionType.reward,
          asset: "SOL",
          quantity: 0.001,
          eurValue: 0,
          eurFee: 0,
          processed: false,
        },
        {
          userId: 1,
          providerAccountId: 1,
          externalId: "BUY-001",
          timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 0.05,
          eurValue: 1000,
          eurFee: 5,
          processed: false,
        },
      ];

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save(transactions);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBe(1000);
      expect(result.newSum).toBe(1000);
    });

    it("should handle decimal precision correctly", async () => {
      const transactions: any[] = [
        {
          userId: 1,
          providerAccountId: 1,
          externalId: "DECIMAL-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
          type: TransactionType.buy,
          asset: "SOL",
          quantity: 0.00000001,
          eurValue: 0.000001,
          eurFee: 0,
          processed: false,
        },
        {
          userId: 1,
          providerAccountId: 1,
          externalId: "DECIMAL-002",
          timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 0.00000001,
          eurValue: 0.000001,
          eurFee: 0,
          processed: false,
        },
      ];

      const repository = dataSource.getRepository(TransactionEntity);
      await repository.save(transactions);

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBeCloseTo(0.000002, 8);
      expect(result.newSum).toBeCloseTo(0.000002, 8);
    });
  });
});
