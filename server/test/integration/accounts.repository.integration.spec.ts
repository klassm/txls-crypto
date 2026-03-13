import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { getDataSource } from "../../src/database.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { AccountsRepository } from "../../src/modules/accounts/accounts.repository.js";
import { AccountsService } from "../../src/modules/accounts/accounts.service.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { PortfolioSnapshotsRepository } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.repository.js";
import { PortfolioSnapshotsService } from "../../src/modules/portfolio-snapshots/portfolio-snapshots.service.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";

describe("AccountsRepository Integration Tests", () => {
  let repository: AccountsRepository;

  afterAll(async () => {
    await destroyTestDataSource();
  });

  beforeEach(async () => {
    await createTestDataSource();
    const dataSource = await getDataSource();
    repository = new AccountsRepository(dataSource);
  });

  describe("save", () => {
    it("should save a new account", async () => {
      const account = new AccountEntity();
      account.userId = 1;
      account.provider = ProviderType.Bitpanda;
      account.createdAt = DateTime.now();
      account.updatedAt = DateTime.now();

      const saved = await repository.save(account);

      const result = await repository.findById(1, 1);

      console.log("Saved:", saved);
      console.log("Found by ID:", result);

      expect(result).toBeDefined();
      expect(result!.id).toBe(1);
      expect(result!.provider).toBe(ProviderType.Bitpanda);
      expect(result!.createdAt).toBeDefined();
      expect(result!.updatedAt).toBeDefined();
      expect(result!.createdAt).toBeInstanceOf(DateTime);
      expect(result!.updatedAt).toBeInstanceOf(DateTime);
    });

    it("should save multiple accounts with auto-incrementing IDs", async () => {
      const now = DateTime.now();
      const account1 = new AccountEntity();
      account1.userId = 1;
      account1.provider = ProviderType.Bitpanda;
      account1.createdAt = now;
      account1.updatedAt = now;

      const account2 = new AccountEntity();
      account2.userId = 1;
      account2.provider = ProviderType.TradeRepublic;
      account2.createdAt = now;
      account2.updatedAt = now;

      const result1 = await repository.save(account1);
      const result2 = await repository.save(account2);

      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
    });
  });

  describe("findById", () => {
    it("should find an account by id", async () => {
      const now = DateTime.now();
      const account = new AccountEntity();
      account.userId = 1;
      account.provider = ProviderType.Bitpanda;
      account.createdAt = now;
      account.updatedAt = now;
      const saved = await repository.save(account);

      const result = await repository.findById(1, saved.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(saved.id);
      expect(result?.provider).toBe(ProviderType.Bitpanda);
    });

    it("should return null when account does not exist", async () => {
      const result = await repository.findById(1, 999);

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return empty array when no accounts exist", async () => {
      const result = await repository.findAll(1);

      expect(result).toEqual([]);
    });

    it("should return all accounts ordered by createdAt DESC", async () => {
      const now = DateTime.now();
      const account1 = new AccountEntity();
      account1.userId = 1;
      account1.provider = ProviderType.Bitpanda;
      account1.createdAt = DateTime.fromISO("2026-01-01T10:00:00Z");
      account1.updatedAt = now;
      const saved1 = await repository.save(account1);

      const account2 = new AccountEntity();
      account2.userId = 1;
      account2.provider = ProviderType.TradeRepublic;
      account2.createdAt = DateTime.fromISO("2026-01-02T11:00:00Z");
      account2.updatedAt = now;
      const saved2 = await repository.save(account2);

      const result = await repository.findAll(1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(saved2.id);
      expect(result[1].id).toBe(saved1.id);
    });
  });

  describe("delete", () => {
    it("should delete an account by id", async () => {
      const now = DateTime.now();
      const account = new AccountEntity();
      account.userId = 1;
      account.provider = ProviderType.Bitpanda;
      account.createdAt = now;
      account.updatedAt = now;
      const saved = await repository.save(account);

      await repository.delete(1, saved.id);

      const result = await repository.findById(1, saved.id);
      expect(result).toBeNull();
    });

    it("should not throw when deleting non-existent account", async () => {
      await expect(repository.delete(1, 999)).resolves.not.toThrow();
    });

    it("should delete associated transactions and portfolio snapshots when deleting an account", async () => {
      const dataSource = await getDataSource();
      const transactionsRepository = new TransactionsRepository(dataSource);
      const snapshotsRepository = new PortfolioSnapshotsRepository(dataSource);
      const snapshotsService = new PortfolioSnapshotsService(dataSource, snapshotsRepository);
      const service = new AccountsService(repository, dataSource, transactionsRepository, snapshotsService);

      const account = new AccountEntity();
      account.userId = 1;
      account.provider = ProviderType.Bitpanda;
      account.createdAt = DateTime.now();
      account.updatedAt = DateTime.now();
      const savedAccount = await repository.save(account);

      const transaction = new TransactionEntity();
      transaction.userId = 1;
      transaction.providerAccountId = savedAccount.id;
      transaction.externalId = "test-tx-1";
      transaction.timestamp = DateTime.now();
      transaction.type = TransactionType.buy;
      transaction.asset = "BTC";
      transaction.quantity = 1;
      transaction.eurValue = 50000;
      transaction.eurFee = 10;
      transaction.eurRate = 50000;
      await transactionsRepository.save(transaction);

      const snapshot = await snapshotsRepository.save({
        userId: 1,
        providerAccountId: savedAccount.id,
        asset: "BTC",
        date: DateTime.now(),
        amount: 1,
        eurInvested: 50000,
        buyCount: 1,
        sellCount: 0,
      });

      await service.delete(1, savedAccount.id);

      const deletedAccount = await repository.findById(1, savedAccount.id);
      expect(deletedAccount).toBeNull();

      const remainingTransactions = await transactionsRepository.findByProviderAccountId(1, savedAccount.id);
      expect(remainingTransactions).toHaveLength(0);

      const remainingSnapshots = await snapshotsRepository.findLatestByAccount(1, savedAccount.id);
      expect(remainingSnapshots).toHaveLength(0);
    });
  });

  describe("count", () => {
    it("should return 0 when no accounts exist", async () => {
      const result = await repository.count();

      expect(result).toBe(0);
    });

    it("should return the correct count", async () => {
      const now = DateTime.now();
      const account1 = new AccountEntity();
      account1.userId = 1;
      account1.provider = ProviderType.Bitpanda;
      account1.createdAt = now;
      account1.updatedAt = now;
      await repository.save(account1);

      const account2 = new AccountEntity();
      account2.userId = 1;
      account2.provider = ProviderType.TradeRepublic;
      account2.createdAt = now;
      account2.updatedAt = now;
      await repository.save(account2);

      const result = await repository.count();

      expect(result).toBe(2);
    });
  });

  describe("exists", () => {
    it("should return false for non-existent account", async () => {
      const result = await repository.exists(1, 999);

      expect(result).toBe(false);
    });

    it("should return true for existing account", async () => {
      const now = DateTime.now();
      const account = new AccountEntity();
      account.provider = ProviderType.Bitpanda;
      account.userId = 1;
      account.createdAt = now;
      account.updatedAt = now;
      const saved = await repository.save(account);

      const result = await repository.exists(1, saved.id);

      expect(result).toBe(true);
    });
  });
});
