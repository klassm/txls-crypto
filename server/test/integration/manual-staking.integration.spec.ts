import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";

describe("Manual Staking", () => {
  let dataSource: any;
  let userId: number;
  let accountId: number;

  beforeAll(async () => {
    process.env.DB_CONNECTION_STRING = ":memory:";
    resetDataSource();
    dataSource = await getDataSource();

    const userRepo = dataSource.getRepository(UserEntity);
    const user = await userRepo.save({
      name: "Test User",
      username: "testuser",
      email: "test@example.com",
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
    expect(saved.quantity).toBe(0.5);
    expect(saved.eurValue).toBe(75.0);
    expect(saved.eurRate).toBe(150.0);
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
    
    const totalQuantity = rewards.reduce((sum, t) => sum + t.quantity, 0);
    const totalEurValue = rewards.reduce((sum, t) => sum + t.eurValue, 0);
    
    expect(totalQuantity).toBeCloseTo(0.8, 5);
    expect(totalEurValue).toBeCloseTo(120.0, 5);
  });
});
