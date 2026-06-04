import { describe, it, expect, beforeEach, vi } from "vitest";
import { ImportDeduplicationService } from "./import-deduplication.service.js";
import { TransactionType, type Transaction } from "@txls/shared";
import { DateTime } from "luxon";
import { TransactionsRepository } from "../modules/transactions/transactions.repository.js";

function createMockRepo(
  existingTransactions: any[] = [],
  deleteResult: number = 0,
): TransactionsRepository {
  return {
    findTransactionsInTimeRange: vi.fn().mockResolvedValue(existingTransactions),
    deleteTransactionsInTimeRange: vi.fn().mockResolvedValue(deleteResult),
  } as unknown as TransactionsRepository;
}

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

describe("ImportDeduplicationService", () => {
  let service: ImportDeduplicationService;
  let mockRepo: TransactionsRepository;

  beforeEach(() => {
    mockRepo = createMockRepo();
    service = new ImportDeduplicationService(mockRepo);
    service.setUserId(1);
  });

  describe("shouldSkipOrReplace", () => {
    it("should skip when no transactions to import", async () => {
      const result = await service.shouldSkipOrReplace(1, []);

      expect(result.shouldSkip).toBe(true);
      expect(result.count).toBe(0);
    });

    it("should import when no existing transactions in range", async () => {
      mockRepo = createMockRepo([]);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const transactions = createBaseTransactions(1);
      const result = await service.shouldSkipOrReplace(1, transactions);

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(0);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(0);
    });

    it("should skip when data matches exactly", async () => {
      const transactions = createBaseTransactions(1);
      const existingEntities = transactions.map((t) => ({
        eurValue: t.eurValue,
        quantity: t.quantity,
      }));
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, transactions);

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBe(3500);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(3);
    });

    it("should replace when sum differs", async () => {
      const transactions = createBaseTransactions(1);
      const existingEntities = [
        { eurValue: 1100, quantity: 0.5 },
        { eurValue: 600, quantity: 0.25 },
        { eurValue: 2100, quantity: 1.0 },
      ];
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, transactions);

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(3800);
      expect(result.newSum).toBe(3500);
      expect(result.count).toBe(3);
      expect(mockRepo.deleteTransactionsInTimeRange).toHaveBeenCalled();
    });

    it("should replace when count differs but sum matches", async () => {
      const transactions = createBaseTransactions(1);
      const existingEntities = [
        { eurValue: 1000, quantity: 0.5 },
        { eurValue: 500, quantity: 0.25 },
        { eurValue: 2000, quantity: 1.0 },
        { eurValue: 200, quantity: 0.1 },
      ];
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, transactions);

      expect(result.shouldSkip).toBe(false);
      expect(result.count).toBe(4);
      expect(mockRepo.deleteTransactionsInTimeRange).toHaveBeenCalled();
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

      const existingEntities = [
        { eurValue: -1000, quantity: 0.5 },
        { eurValue: -2000, quantity: 1.0 },
      ];
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, transactions);

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

      const existingEntities = [
        { eurValue: 0, quantity: 0.001 },
        { eurValue: 1000, quantity: 0.05 },
      ];
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, transactions);

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

      const existingEntities = [
        { eurValue: 0.000001, quantity: 0.00000001 },
        { eurValue: 0.000001, quantity: 0.00000001 },
      ];
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, transactions);

      expect(result.shouldSkip).toBe(true);
      expect(result.existingSum).toBeCloseTo(0.000002, 8);
      expect(result.newSum).toBeCloseTo(0.000002, 8);
    });

    it("should replace when eurValue matches but quantity differs", async () => {
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

      const existingEntities = [
        { eurValue: 6187.28, quantity: 6187.28 },
      ];
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      const result = await service.shouldSkipOrReplace(1, newTransactions);

      expect(result.shouldSkip).toBe(false);
      expect(result.existingSum).toBe(6187.28);
      expect(result.newSum).toBe(6187.28);
      expect(result.existingQuantitySum).toBe(6187.28);
      expect(result.newQuantitySum).toBe(0.1);
      expect(mockRepo.deleteTransactionsInTimeRange).toHaveBeenCalled();
    });

    it("should not delete when sums match", async () => {
      const transactions = createBaseTransactions(1);
      const existingEntities = transactions.map((t) => ({
        eurValue: t.eurValue,
        quantity: t.quantity,
      }));
      mockRepo = createMockRepo(existingEntities);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      await service.shouldSkipOrReplace(1, transactions);

      expect(mockRepo.deleteTransactionsInTimeRange).not.toHaveBeenCalled();
    });

    it("should pass correct time range to repository", async () => {
      const transactions = createBaseTransactions(1);
      mockRepo = createMockRepo([]);
      service = new ImportDeduplicationService(mockRepo);
      service.setUserId(1);

      await service.shouldSkipOrReplace(1, transactions);

      expect(mockRepo.findTransactionsInTimeRange).toHaveBeenCalledWith(
        1,
        DateTime.fromISO("2026-02-19T10:00:00.000Z").toMillis(),
        DateTime.fromISO("2026-02-19T12:00:00.000Z").toMillis(),
        1,
      );
    });
  });
});
