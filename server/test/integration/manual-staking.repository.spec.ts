import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";

describe("Manual Staking Repository Integration", () => {
  let dataSource: any;
  let userId: number;
  let accountId: number;

  beforeAll(async () => {
    process.env.DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING || "mysql://testuser:testpass@localhost:3306/txls_test";
    resetDataSource();
    dataSource = await getDataSource();

    const userRepo = dataSource.getRepository(UserEntity);
    const user = await userRepo.save({
      name: "Test User",
      username: `testuser-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      password: "password123",
      isAdmin: false,
    });
    userId = user.id;

    const accountRepo = dataSource.getRepository(AccountEntity);
    const account = await accountRepo.save({
      userId,
      provider: ProviderType.TradeRepublic,
    });
    accountId = account.id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    resetDataSource();
  });

  it("should save manual staking reward transaction", async () => {
    const transactionsRepo = new TransactionsRepository(dataSource);
    
    const entity = new TransactionEntity();
    entity.providerAccountId = accountId;
    entity.userId = userId;
    entity.externalId = `manual-staking-2025-01-15T10:00:00-SOL`;
    entity.timestamp = DateTime.fromISO("2025-01-15T10:00:00");
    entity.type = TransactionType.reward;
    entity.asset = "SOL";
    entity.quantity = 0.5;
    entity.eurValue = 75.0;
    entity.eurFee = 0;
    entity.eurRate = 150.0;
    entity.processed = false;

    const saved = await transactionsRepo.save(entity);
    
    expect(saved).toBeDefined();
    expect(saved.type).toBe(TransactionType.reward);
    expect(saved.asset).toBe("SOL");
    expect(Number(saved.quantity)).toBeCloseTo(0.5, 5);
    expect(Number(saved.eurValue)).toBeCloseTo(75.0, 5);
    expect(Number(saved.eurRate)).toBeCloseTo(150.0, 5);
  });

  it("should find manual staking transactions by account", async () => {
    const transactionsRepo = new TransactionsRepository(dataSource);
    
    const transactions = await transactionsRepo.findByProviderAccountId(userId, accountId);
    
    const reward = transactions.find(t => t.type === TransactionType.reward);
    expect(reward).toBeDefined();
    expect(reward?.asset).toBe("SOL");
  });

  it("should calculate correct totals for manual staking rewards", async () => {
    const transactionsRepo = new TransactionsRepository(dataSource);
    
    const entity = new TransactionEntity();
    entity.providerAccountId = accountId;
    entity.userId = userId;
    entity.externalId = `manual-staking-2025-02-15T10:00:00-SOL`;
    entity.timestamp = DateTime.fromISO("2025-02-15T10:00:00");
    entity.type = TransactionType.reward;
    entity.asset = "SOL";
    entity.quantity = 0.3;
    entity.eurValue = 45.0;
    entity.eurFee = 0;
    entity.eurRate = 150.0;
    entity.processed = false;
    
    await transactionsRepo.save(entity);

    const transactions = await transactionsRepo.findByProviderAccountId(userId, accountId);
    const rewards = transactions.filter(t => t.type === TransactionType.reward);
    
    const totalQuantity = rewards.reduce((sum, t) => sum + Number(t.quantity), 0);
    const totalEurValue = rewards.reduce((sum, t) => sum + Number(t.eurValue), 0);
    
    expect(totalQuantity).toBeCloseTo(0.8, 5);
    expect(totalEurValue).toBeCloseTo(120.0, 5);
  });
});
