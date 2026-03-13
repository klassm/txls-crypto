import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { getDataSource } from "../../src/database.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import taxRouter from "../../src/routes/tax/index.js";
import { generateToken, AUTH_COOKIE_NAME } from "../../src/utils/password.js";
import { DateTime } from "luxon";
import { ProviderType, TransactionType } from "@txls/shared";
import * as database from "../../src/database.js";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";
import { TransferMatchingService } from "../../src/modules/transfers/transfer-matching.service.js";
import { TaxCalculationService } from "../../src/modules/tax/tax-calculator.service.js";

let testUserIdCounter = 1;

describe("Transfer Flow Integration Tests", () => {
  let app: express.Application;

  afterAll(async () => {
    vi.restoreAllMocks();
    await destroyTestDataSource();
  });

  beforeEach(async () => {
    await createTestDataSource();
    const dataSource = await getDataSource();

    vi.spyOn(database, "getDataSource").mockResolvedValue(dataSource);

    app = express();
    app.use(cookieParser());
    app.use("/api/tax", taxRouter);
    
    testUserIdCounter++;
  });

  const createTestUser = (userId: number): string => {
    const authJwtToken = generateToken({
      userId,
      username: "testuser",
      email: "test@example.com",
      isAdmin: false,
    });
    return authJwtToken;
  };

  const createTestAccount = async (userId: number): Promise<AccountEntity> => {
    const account = new AccountEntity();
    account.userId = userId;
    account.provider = ProviderType.Bitpanda;
    account.createdAt = DateTime.now();
    account.updatedAt = DateTime.now();
    return (await getDataSource()).getRepository(AccountEntity).save(account);
  };

  const createTransaction = async (
    userId: number,
    providerAccountId: number,
    type: TransactionType,
    asset: string,
    quantity: number,
    eurValue: number,
    timestamp: DateTime,
    linkedTransactionId?: number,
    originalAcquisitionTimestamp?: DateTime,
    originalEurValue?: number,
  ): Promise<TransactionEntity> => {
    const tx = new TransactionEntity();
    tx.userId = userId;
    tx.providerAccountId = providerAccountId;
    tx.externalId = `test-${Date.now()}-${Math.random()}`;
    tx.timestamp = timestamp;
    tx.type = type;
    tx.asset = asset;
    tx.quantity = quantity;
    tx.eurValue = eurValue;
    tx.eurFee = 0;
    tx.processed = false;
    tx.linkedTransactionId = linkedTransactionId ?? null;
    tx.originalAcquisitionTimestamp = originalAcquisitionTimestamp ?? null;
    tx.originalEurValue = originalEurValue ?? null;
    return (await getDataSource()).getRepository(TransactionEntity).save(tx);
  };

  describe("TransferMatchingService", () => {
    it("should match withdrawal to deposit across accounts", async () => {
      const userId = testUserIdCounter;
      const account1 = await createTestAccount(userId);
      const account2 = await createTestAccount(userId);

      await createTransaction(
        userId, account1.id, TransactionType.buy, "BTC", 0.1, 1000,
        DateTime.fromISO("2024-01-01T10:00:00Z")
      );

      await createTransaction(
        userId, account1.id, TransactionType.withdrawal, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:00:00Z")
      );

      await createTransaction(
        userId, account2.id, TransactionType.deposit, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:30:00Z")
      );

      const dataSource = await getDataSource();
      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const matchingService = new TransferMatchingService(dataSource);
      const matches = matchingService.findMatches(transactions as any);

      expect(matches).toHaveLength(1);
      expect(matches[0].asset).toBe("BTC");
      expect(matches[0].quantity).toBeCloseTo(0.1, 5);
    });

    it("should not match transfers from same account", async () => {
      const userId = testUserIdCounter;
      const account = await createTestAccount(userId);

      await createTransaction(
        userId, account.id, TransactionType.withdrawal, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:00:00Z")
      );

      await createTransaction(
        userId, account.id, TransactionType.deposit, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:30:00Z")
      );

      const dataSource = await getDataSource();
      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const matchingService = new TransferMatchingService(dataSource);
      const matches = matchingService.findMatches(transactions as any);

      expect(matches).toHaveLength(0);
    });
  });

  describe("TaxCalculationService with transfers", () => {
    it("should treat unmatched withdrawal as taxable sell", async () => {
      const userId = testUserIdCounter;
      const account = await createTestAccount(userId);

      await createTransaction(
        userId, account.id, TransactionType.buy, "BTC", 0.1, 1000,
        DateTime.fromISO("2024-01-01T10:00:00Z")
      );

      await createTransaction(
        userId, account.id, TransactionType.withdrawal, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:00:00Z")
      );

      const dataSource = await getDataSource();
      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const taxService = new TaxCalculationService();
      const result = taxService.calculateTax(transactions as any);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(1);
      expect(btcCalc?.transactions[0].type).toBe("sell");
      expect(btcCalc?.totalGain).toBeCloseTo(200, 2);
    });

    it("should skip matched withdrawal from tax calculation", async () => {
      const userId = testUserIdCounter;
      const account1 = await createTestAccount(userId);
      const account2 = await createTestAccount(userId);

      await createTransaction(
        userId, account1.id, TransactionType.buy, "BTC", 0.1, 1000,
        DateTime.fromISO("2024-01-01T10:00:00Z")
      );

      const withdrawalTx = await createTransaction(
        userId, account1.id, TransactionType.withdrawal, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:00:00Z")
      );

      const depositTx = await createTransaction(
        userId, account2.id, TransactionType.deposit, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:30:00Z")
      );

      const dataSource = await getDataSource();
      await dataSource.getRepository(TransactionEntity).update(
        { id: withdrawalTx.id },
        { linkedTransactionId: depositTx.id }
      );
      await dataSource.getRepository(TransactionEntity).update(
        { id: depositTx.id },
        { linkedTransactionId: withdrawalTx.id }
      );

      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const taxService = new TaxCalculationService();
      const result = taxService.calculateTax(transactions as any);

      expect(result.size).toBe(0);
    });

    it("should treat unmatched deposit as acquisition with zero cost basis", async () => {
      const userId = testUserIdCounter;
      const account = await createTestAccount(userId);

      await createTransaction(
        userId, account.id, TransactionType.deposit, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:00:00Z")
      );

      await createTransaction(
        userId, account.id, TransactionType.sell, "BTC", 0.1, 1500,
        DateTime.fromISO("2024-07-01T10:00:00Z")
      );

      const dataSource = await getDataSource();
      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const taxService = new TaxCalculationService();
      const result = taxService.calculateTax(transactions as any);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(1);
      expect(btcCalc?.transactions[0].costBasis).toBe(0);
      expect(btcCalc?.totalGain).toBeCloseTo(1500, 2);
    });

    it("should transfer cost basis through matched deposit", async () => {
      const userId = testUserIdCounter;
      const account1 = await createTestAccount(userId);
      const account2 = await createTestAccount(userId);

      const buyTx = await createTransaction(
        userId, account1.id, TransactionType.buy, "BTC", 0.1, 1000,
        DateTime.fromISO("2024-01-01T10:00:00Z")
      );

      const withdrawalTx = await createTransaction(
        userId, account1.id, TransactionType.withdrawal, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:00:00Z"),
        undefined,
        buyTx.timestamp,
        1000
      );

      const depositTx = await createTransaction(
        userId, account2.id, TransactionType.deposit, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-06-01T10:30:00Z"),
        withdrawalTx.id,
        buyTx.timestamp,
        1000
      );

      await createTransaction(
        userId, account2.id, TransactionType.sell, "BTC", 0.1, 1500,
        DateTime.fromISO("2024-07-01T10:00:00Z")
      );

      const dataSource = await getDataSource();
      await dataSource.getRepository(TransactionEntity).update(
        { id: withdrawalTx.id },
        { linkedTransactionId: depositTx.id }
      );

      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const taxService = new TaxCalculationService();
      const result = taxService.calculateTax(transactions as any);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(1);
      expect(btcCalc?.transactions[0].costBasis).toBeCloseTo(1000, 2);
      expect(btcCalc?.totalGain).toBeCloseTo(500, 2);
    });

    it("should preserve cost basis through chain transfer (A -> B -> C)", async () => {
      const userId = testUserIdCounter;
      const accountA = await createTestAccount(userId);
      const accountB = await createTestAccount(userId);
      const accountC = await createTestAccount(userId);

      const buyTx = await createTransaction(
        userId, accountA.id, TransactionType.buy, "BTC", 0.1, 1000,
        DateTime.fromISO("2024-01-01T10:00:00Z")
      );

      const withdrawalA = await createTransaction(
        userId, accountA.id, TransactionType.withdrawal, "BTC", 0.1, 1100,
        DateTime.fromISO("2024-06-01T10:00:00Z")
      );

      const depositB = await createTransaction(
        userId, accountB.id, TransactionType.deposit, "BTC", 0.1, 1100,
        DateTime.fromISO("2024-06-01T10:30:00Z")
      );

      const withdrawalB = await createTransaction(
        userId, accountB.id, TransactionType.withdrawal, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-07-01T10:00:00Z")
      );

      const depositC = await createTransaction(
        userId, accountC.id, TransactionType.deposit, "BTC", 0.1, 1200,
        DateTime.fromISO("2024-07-01T10:30:00Z")
      );

      await createTransaction(
        userId, accountC.id, TransactionType.sell, "BTC", 0.1, 1500,
        DateTime.fromISO("2024-08-01T10:00:00Z")
      );

      const dataSource = await getDataSource();
      
      await dataSource.getRepository(TransactionEntity).update(
        { id: withdrawalA.id },
        { linkedTransactionId: depositB.id }
      );
      await dataSource.getRepository(TransactionEntity).update(
        { id: depositB.id },
        { 
          linkedTransactionId: withdrawalA.id,
          originalAcquisitionTimestamp: buyTx.timestamp,
          originalEurValue: 1000
        }
      );
      await dataSource.getRepository(TransactionEntity).update(
        { id: withdrawalB.id },
        { linkedTransactionId: depositC.id }
      );
      await dataSource.getRepository(TransactionEntity).update(
        { id: depositC.id },
        { 
          linkedTransactionId: withdrawalB.id,
          originalAcquisitionTimestamp: buyTx.timestamp,
          originalEurValue: 1000
        }
      );

      const transactions = await dataSource.getRepository(TransactionEntity)
        .find({ where: { userId } });

      const taxService = new TaxCalculationService();
      const result = taxService.calculateTax(transactions as any);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(1);
      expect(btcCalc?.transactions[0].costBasis).toBeCloseTo(1000, 2);
      expect(btcCalc?.totalGain).toBeCloseTo(500, 2);
    });
  });
});
