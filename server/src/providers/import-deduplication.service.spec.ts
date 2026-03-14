import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDataSource, resetDataSource } from "../database.js";
import { ImportDeduplicationService } from "./import-deduplication.service.js";
import { TransactionEntity } from "../modules/transactions/transaction.entity.js";
import { TransactionType, type Transaction } from "@txls/shared";
import { DateTime } from "luxon";

describe("ImportDeduplicationService", () => {
  let deduplicationService: ImportDeduplicationService;

  beforeEach(async () => {
    process.env.DB_CONNECTION_STRING = ":memory:";
    resetDataSource();
    const dataSource = await getDataSource();
    deduplicationService = new ImportDeduplicationService(dataSource);
  });

  afterEach(async () => {
    const ds = await getDataSource();
    if (ds?.isInitialized) {
      await ds.destroy();
    }
    resetDataSource();
    delete process.env.DB_CONNECTION_STRING;
  });

  const createBaseTransactions = (accountId: number): Transaction[] => {
    const t1: Transaction = {
      id: 0,
      providerAccountId: accountId,
      externalId: "TEST-001",
      timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
      type: TransactionType.buy,
      asset: "BTC",
      quantity: 0.5,
      eurValue: 1000,
      eurFee: 5,
      eurRate: 2000,
      processed: false,
    };

    const t2: Transaction = {
      id: 0,
      providerAccountId: accountId,
      externalId: "TEST-002",
      timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
      type: TransactionType.sell,
      asset: "BTC",
      quantity: 0.25,
      eurValue: 500,
      eurFee: 2,
      eurRate: 2000,
      processed: false,
    };

    const t3: Transaction = {
      id: 0,
      providerAccountId: accountId,
      externalId: "TEST-003",
      timestamp: DateTime.fromISO("2026-02-19T12:00:00.000Z"),
      type: TransactionType.buy,
      asset: "ETH",
      quantity: 1.0,
      eurValue: 2000,
      eurFee: 10,
      eurRate: 2000,
      processed: false,
    };

    return [t1, t2, t3];
  };

  const toEntity = (tx: Transaction): TransactionEntity => {
    const entity = new TransactionEntity();
    entity.userId = 1;
    entity.providerAccountId = tx.providerAccountId;
    entity.externalId = tx.externalId;
    entity.timestamp = tx.timestamp;
    entity.type = tx.type;
    entity.asset = tx.asset;
    entity.quantity = tx.quantity;
    entity.eurValue = tx.eurValue;
    entity.eurFee = tx.eurFee;
    entity.eurRate = tx.eurRate ?? 0;
    entity.processed = tx.processed;
    return entity;
  };

  const toEntities = (transactions: Transaction[]): TransactionEntity[] => {
    return transactions.map(toEntity);
  };

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
      const repository = (await getDataSource()).getRepository(TransactionEntity);

      await repository.save(toEntities(transactions));

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

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities(existingTransactions));

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
      const extraTransaction: Transaction = {
        id: 0,
        providerAccountId: 1,
        externalId: "TEST-004",
        timestamp: DateTime.fromISO("2026-02-19T10:30:00.000Z"),
        type: TransactionType.sell,
        asset: "BTC",
        quantity: 0.1,
        eurValue: 200,
        eurFee: 1,
        eurRate: 2000,
        processed: false,
      };

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities([...existingTransactions, extraTransaction]));

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
      const account2Transactions = createBaseTransactions(2).map((t) => ({
        ...t,
        providerAccountId: 2,
        externalId: `ACC2-${t.externalId}`,
      }));

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities(account1Transactions));
      await repository.save(toEntities(account2Transactions));

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
      const outsideRangeTransaction: Transaction = {
        id: 0,
        providerAccountId: 1,
        externalId: "TEST-OUTSIDE",
        timestamp: DateTime.fromISO("2026-02-18T10:00:00.000Z"),
        type: TransactionType.buy,
        asset: "SOL",
        quantity: 1.0,
        eurValue: 150,
        eurFee: 1,
        eurRate: 150,
        processed: false,
      };

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities([...account1Transactions, outsideRangeTransaction]));

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
      const transactions: Transaction[] = [
        {
          id: 0,
          providerAccountId: 1,
          externalId: "SELL-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
          type: TransactionType.sell,
          asset: "BTC",
          quantity: 0.5,
          eurValue: -1000,
          eurFee: 5,
          eurRate: 2000,
          processed: false,
        },
        {
          id: 0,
          providerAccountId: 1,
          externalId: "SELL-002",
          timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
          type: TransactionType.sell,
          asset: "ETH",
          quantity: 1.0,
          eurValue: -2000,
          eurFee: 10,
          eurRate: 2000,
          processed: false,
        },
      ];

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities(transactions));

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBe(3000);
      expect(result.newSum).toBe(3000);
    });

    it("should handle reward transactions (zero eurValue)", async () => {
      const transactions: Transaction[] = [
        {
          id: 0,
          providerAccountId: 1,
          externalId: "REWARD-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
          type: TransactionType.reward,
          asset: "SOL",
          quantity: 0.001,
          eurValue: 0,
          eurFee: 0,
          eurRate: 0,
          processed: false,
        },
        {
          id: 0,
          providerAccountId: 1,
          externalId: "BUY-001",
          timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 0.05,
          eurValue: 1000,
          eurFee: 5,
          eurRate: 20000,
          processed: false,
        },
      ];

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities(transactions));

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBe(1000);
      expect(result.newSum).toBe(1000);
    });

    it("should handle decimal precision correctly", async () => {
      const transactions: Transaction[] = [
        {
          id: 0,
          providerAccountId: 1,
          externalId: "DECIMAL-001",
          timestamp: DateTime.fromISO("2026-02-19T10:00:00.000Z"),
          type: TransactionType.buy,
          asset: "SOL",
          quantity: 0.00000001,
          eurValue: 0.000001,
          eurFee: 0,
          eurRate: 100,
          processed: false,
        },
        {
          id: 0,
          providerAccountId: 1,
          externalId: "DECIMAL-002",
          timestamp: DateTime.fromISO("2026-02-19T11:00:00.000Z"),
          type: TransactionType.buy,
          asset: "BTC",
          quantity: 0.00000001,
          eurValue: 0.000001,
          eurFee: 0,
          eurRate: 100,
          processed: false,
        },
      ];

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities(transactions));

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        transactions,
      );

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBeCloseTo(0.000002, 8);
      expect(result.newSum).toBeCloseTo(0.000002, 8);
    });

    it("should replace when eurValue matches but quantity differs", async () => {
      const existingTransactions: Transaction[] = [
        {
          id: 0,
          providerAccountId: 1,
          externalId: "DEPOSIT-001",
          timestamp: DateTime.fromISO("2026-03-14T10:00:00.000Z"),
          type: TransactionType.deposit,
          asset: "BTC",
          quantity: 6187.28,
          eurValue: 6187.28,
          eurFee: 0,
          eurRate: 61872.75,
          processed: false,
        },
      ];

      const repository = (await getDataSource()).getRepository(TransactionEntity);
      await repository.save(toEntities(existingTransactions));

      const newTransactions: Transaction[] = [
        {
          id: 0,
          providerAccountId: 1,
          externalId: "DEPOSIT-001",
          timestamp: DateTime.fromISO("2026-03-14T10:00:00.000Z"),
          type: TransactionType.deposit,
          asset: "BTC",
          quantity: 0.1,
          eurValue: 6187.28,
          eurFee: 0,
          eurRate: 61872.75,
          processed: false,
        },
      ];

      const result = await deduplicationService.shouldSkipOrReplace(
        1,
        newTransactions,
      );

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(6187.28);
      expect(result.newSum).toBe(6187.28);
      expect(result.existingQuantitySum).toBe(6187.28);
      expect(result.newQuantitySum).toBe(0.1);

      const remaining = await repository.count({ where: { providerAccountId: 1 } });
      expect(remaining).toBe(0);
    });
  });
});
