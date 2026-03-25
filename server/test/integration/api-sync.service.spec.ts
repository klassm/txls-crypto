import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { AccountsRepository } from "../../src/modules/accounts/accounts.repository.js";
import { ApiSyncService } from "../../src/modules/api-sync/api-sync.service.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { ProviderType, TransactionType, Transaction } from "@txls/shared";
import { DateTime } from "luxon";
import { encrypt } from "../../src/modules/api-sync/encryption.service.js";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";
import { createContainer, resetContainer, getContainer } from "../../src/di/container.js";
import { TYPES } from "../../src/di/types.js";
import * as registry from "../../src/providers/registry.js";

vi.mock("../../src/providers/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/providers/registry.js")>();
  return {
    ...actual,
    getProviderConfig: vi.fn(),
  };
});

describe("API Sync Service Integration", () => {
  let dataSource: any;
  let userId: number;
  let accountId: number;
  let transactionsRepo: TransactionsRepository;
  let accountsRepo: AccountsRepository;

  beforeAll(async () => {
    await createTestDataSource();
    dataSource = await getDataSource();
    createContainer(dataSource);
    transactionsRepo = new TransactionsRepository(dataSource);
    accountsRepo = new AccountsRepository(dataSource);
  });

  afterAll(async () => {
    resetContainer();
    await destroyTestDataSource();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const dataSource = await getDataSource();
    await dataSource.query("DELETE FROM transactions");
    await dataSource.query("DELETE FROM provider_accounts");
    await dataSource.query("DELETE FROM users");

    const userRepo = dataSource.getRepository(UserEntity);
    const user = new UserEntity();
    user.name = "Test User";
    user.username = "testuser";
    user.email = "test@example.com";
    user.password = "password123";
    user.isAdmin = false;
    const savedUser = await userRepo.save(user);
    userId = savedUser.id;

    const account = new AccountEntity();
    account.userId = userId;
    account.provider = ProviderType.Bitpanda;
    account.apiKeyEncrypted = encrypt("test-api-key");
    account.apiEnabled = true;
    const savedAccount = await accountsRepo.save(account);
    accountId = savedAccount.id;
  });

  describe("Full Sync", () => {
    it("should delete all existing transactions before importing new ones", async () => {
      const entity = new TransactionEntity();
      entity.providerAccountId = accountId;
      entity.userId = userId;
      entity.externalId = "old-csv-transaction";
      entity.timestamp = DateTime.fromISO("2024-01-01T10:00:00");
      entity.type = TransactionType.buy;
      entity.asset = "BTC";
      entity.quantity = 1;
      entity.eurValue = 50000;
      entity.eurFee = 0;
      entity.eurRate = 50000;
      entity.processed = false;
      await transactionsRepo.save(entity);

      const existing = await transactionsRepo.findByProviderAccountId(userId, accountId);
      expect(existing).toHaveLength(1);
      expect(existing[0].externalId).toBe("old-csv-transaction");

      mockProviderConfig([
        createMockTransaction("api-tx-1", "2025-01-01T10:00:00", TransactionType.buy, "ETH", 1, 3000),
        createMockTransaction("api-tx-2", "2025-01-02T10:00:00", TransactionType.buy, "SOL", 10, 1500),
      ]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      const result = await syncService.syncAccount(accountId, userId);

      expect(result.success).toBe(true);
      expect(result.imported).toBe(2);

      const transactions = await transactionsRepo.findByProviderAccountId(userId, accountId);
      expect(transactions).toHaveLength(2);
      expect(transactions.find(t => t.externalId === "old-csv-transaction")).toBeUndefined();
      expect(transactions.find(t => t.externalId === "api-tx-1")).toBeDefined();
      expect(transactions.find(t => t.externalId === "api-tx-2")).toBeDefined();
    });

    it("should not delete transactions from other accounts", async () => {
      const otherAccount = new AccountEntity();
      otherAccount.userId = userId;
      otherAccount.provider = ProviderType.TradeRepublic;
      const savedOtherAccount = await accountsRepo.save(otherAccount);

      const entity = new TransactionEntity();
      entity.providerAccountId = savedOtherAccount.id;
      entity.userId = userId;
      entity.externalId = "other-account-tx";
      entity.timestamp = DateTime.fromISO("2024-01-01T10:00:00");
      entity.type = TransactionType.buy;
      entity.asset = "BTC";
      entity.quantity = 1;
      entity.eurValue = 50000;
      entity.eurFee = 0;
      entity.eurRate = 50000;
      entity.processed = false;
      await transactionsRepo.save(entity);

      mockProviderConfig([
        createMockTransaction("api-tx-1", "2025-01-01T10:00:00", TransactionType.buy, "ETH", 1, 3000),
      ]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      await syncService.syncAccount(accountId, userId);

      const otherAccountTxs = await transactionsRepo.findByProviderAccountId(userId, savedOtherAccount.id);
      expect(otherAccountTxs).toHaveLength(1);
      expect(otherAccountTxs[0].externalId).toBe("other-account-tx");
    });

    it("should import staking rewards correctly", async () => {
      mockProviderConfig([
        createMockTransaction("staking-reward-1", "2025-01-01T10:00:00", TransactionType.reward, "SOL", 0.5, 75),
        createMockTransaction("staking-reward-2", "2025-02-01T10:00:00", TransactionType.reward, "SOL", 0.3, 45),
      ]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      const result = await syncService.syncAccount(accountId, userId);

      expect(result.success).toBe(true);
      expect(result.imported).toBe(2);

      const transactions = await transactionsRepo.findByProviderAccountId(userId, accountId);
      const rewards = transactions.filter(t => t.type === TransactionType.reward);
      expect(rewards).toHaveLength(2);
      expect(rewards[0].asset).toBe("SOL");
    });

    it("should update lastSyncAt after successful sync", async () => {
      mockProviderConfig([
        createMockTransaction("api-tx-1", "2025-01-01T10:00:00", TransactionType.buy, "ETH", 1, 3000),
      ]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      await syncService.syncAccount(accountId, userId);

      const account = await accountsRepo.findById(userId, accountId);
      expect(account!.lastSyncAt).toBeDefined();
      expect(account!.lastSyncAt).not.toBeNull();
    });

    it("should clear sync error after successful sync", async () => {
      const account = await accountsRepo.findById(userId, accountId);
      account!.syncError = "Previous error";
      await accountsRepo.save(account!);

      mockProviderConfig([
        createMockTransaction("api-tx-1", "2025-01-01T10:00:00", TransactionType.buy, "ETH", 1, 3000),
      ]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      await syncService.syncAccount(accountId, userId);

      const updatedAccount = await accountsRepo.findById(userId, accountId);
      expect(updatedAccount!.syncError).toBeNull();
    });

    it("should handle empty response from API", async () => {
      mockProviderConfig([]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      const result = await syncService.syncAccount(accountId, userId);

      expect(result.success).toBe(true);
      expect(result.imported).toBe(0);

      const transactions = await transactionsRepo.findByProviderAccountId(userId, accountId);
      expect(transactions).toHaveLength(0);
    });

    it("should always do full sync (delete existing transactions)", async () => {
      const entity1 = new TransactionEntity();
      entity1.providerAccountId = accountId;
      entity1.userId = userId;
      entity1.externalId = "existing-tx-1";
      entity1.timestamp = DateTime.fromISO("2024-01-01T10:00:00");
      entity1.type = TransactionType.buy;
      entity1.asset = "BTC";
      entity1.quantity = 1;
      entity1.eurValue = 50000;
      entity1.eurFee = 0;
      entity1.eurRate = 50000;
      entity1.processed = false;
      await transactionsRepo.save(entity1);

      mockProviderConfig([
        createMockTransaction("existing-tx-1", "2024-01-01T10:00:00", TransactionType.buy, "BTC", 1, 50000),
        createMockTransaction("new-tx-1", "2025-02-01T10:00:00", TransactionType.buy, "ETH", 2, 6000),
      ]);

      const syncService = getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
      const result = await syncService.syncAccount(accountId, userId);

      expect(result.success).toBe(true);
      expect(result.imported).toBe(2);

      const transactions = await transactionsRepo.findByProviderAccountId(userId, accountId);
      expect(transactions).toHaveLength(2);
    });
  });
});

function mockProviderConfig(transactions: Transaction[]) {
  vi.mocked(registry.getProviderConfig).mockReturnValue({
    provider: ProviderType.Bitpanda,
    csvImporter: {} as any,
    apiClient: {
      testConnection: async () => true,
      fetchTransactions: async () => ({
        transactions,
        wasIncremental: false,
      }),
    },
  } as any);
}

function createMockTransaction(
  externalId: string,
  timestamp: string,
  type: TransactionType,
  asset: string,
  quantity: number,
  eurValue: number
): Transaction {
  return {
    id: 0,
    providerAccountId: 0,
    externalId,
    timestamp: DateTime.fromISO(timestamp),
    type,
    asset,
    quantity,
    eurValue,
    eurFee: 0,
    eurRate: eurValue / quantity,
    processed: false,
  };
}
