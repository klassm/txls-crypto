import { describe, it, expect } from "vitest";
import { TransferMatchingService, TransferMatch } from "./transfer-matching.service.js";
import type { Transaction } from "@txls/shared";
import { DateTime } from "luxon";

const mockDataSource = {} as any;
const mockTransactionsRepo = {} as any;

describe("TransferMatchingService", () => {
  const createTransaction = (
    id: number,
    timestamp: string,
    type: "buy" | "sell" | "reward" | "deposit" | "withdrawal",
    asset: string,
    quantity: number,
    eurValue: number,
    eurFee: number,
    providerAccountId: number = 1,
    linkedTransactionId?: number,
    originalAcquisitionTimestamp?: DateTime,
  ): Transaction => ({
    id,
    providerAccountId,
    externalId: `test-${id}`,
    processed: true,
    timestamp: DateTime.fromISO(timestamp),
    type: type as any,
    asset,
    quantity,
    eurValue,
    eurFee,
    eurRate: eurValue > 0 && quantity > 0 ? eurValue / quantity : 0,
    linkedTransactionId,
    originalAcquisitionTimestamp,
  } as Transaction);

  describe("findMatches", () => {
    it("should match withdrawal to deposit with same asset and quantity", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T10:00:00Z", "buy", "BTC", 0.1, 1000, 0, 1),
        createTransaction(2, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(3, "2024-06-01T10:30:00Z", "deposit", "BTC", 0.1, 1200, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(1);
      expect(matches[0].withdrawalId).toBe(2);
      expect(matches[0].depositId).toBe(3);
      expect(matches[0].asset).toBe("BTC");
      expect(matches[0].quantity).toBeCloseTo(0.1, 5);
    });

    it("should not match transactions with different assets", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "ETH", 0.1, 1200, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(0);
    });

    it("should not match transactions with different quantities", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "BTC", 0.2, 2400, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(0);
    });

    it("should not match transactions outside time window (default 48h)", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-05T10:30:00Z", "deposit", "BTC", 0.1, 1200, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(0);
    });

    it("should match transactions within time window (same day)", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T08:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T20:00:00Z", "deposit", "BTC", 0.1, 1200, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(1);
    });

    it("should not match already linked transactions", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1, 999),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "BTC", 0.1, 1200, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(0);
    });

    it("should match withdrawal to closest deposit when multiple candidates exist", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T11:00:00Z", "deposit", "BTC", 0.1, 1200, 0, 2),
        createTransaction(3, "2024-06-01T15:00:00Z", "deposit", "BTC", 0.1, 1200, 0, 3),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(1);
      expect(matches[0].depositId).toBe(2);
    });

    it("should match multiple withdrawal/deposit pairs", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "BTC", 0.1, 1200, 0, 2),
        createTransaction(3, "2024-06-02T10:00:00Z", "withdrawal", "ETH", 1.0, 2000, 0, 1),
        createTransaction(4, "2024-06-02T10:30:00Z", "deposit", "ETH", 1.0, 2000, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(2);
      expect(matches.find(m => m.asset === "BTC")).toBeDefined();
      expect(matches.find(m => m.asset === "ETH")).toBeDefined();
    });

    it("should not match withdrawal to deposit on same account", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "BTC", 0.1, 1200, 0, 1),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(0);
    });

    it("should handle quantity with small floating point tolerance", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.10000001, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "BTC", 0.10000002, 1200, 0, 2),
      ];

      const matches = service.findMatches(transactions);

      expect(matches).toHaveLength(1);
    });
  });

  describe("getUnmatchedWithdrawals", () => {
    it("should return withdrawals without linked deposit", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "ETH", 1.0, 2000, 0, 2),
      ];

      const unmatched = service.getUnmatchedWithdrawals(transactions);

      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].id).toBe(1);
    });

    it("should not return already linked withdrawals", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1, 2),
      ];

      const unmatched = service.getUnmatchedWithdrawals(transactions);

      expect(unmatched).toHaveLength(0);
    });
  });

  describe("getUnmatchedDeposits", () => {
    it("should return deposits without linked withdrawal", () => {
      const service = new TransferMatchingService(mockDataSource, mockTransactionsRepo);
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T10:00:00Z", "withdrawal", "BTC", 0.1, 1200, 0, 1),
        createTransaction(2, "2024-06-01T10:30:00Z", "deposit", "ETH", 1.0, 2000, 0, 2),
      ];

      const unmatched = service.getUnmatchedDeposits(transactions);

      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].id).toBe(2);
    });
  });
});
