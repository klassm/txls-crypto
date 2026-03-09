import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { rmSync } from "fs";
import path from "path";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionsService } from "../../src/modules/transactions/transactions.service.js";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";

const dbConnectionString = process.env.DB_CONNECTION_STRING;

const allConfigs = [
  {
    name: "better-sqlite3",
    displayName: "SQLite",
    match: (cs: string) => cs.includes(":memory:") || cs.endsWith(".db") || !cs.includes("://"),
    connectionString: dbConnectionString || "./data/test-txls.db",
    setup: async () => {
      process.env.DB_CONNECTION_STRING = dbConnectionString || "./data/test-txls.db";
    },
    teardown: async () => {
      const dbPath = path.join(process.cwd(), "data/test-txls.db");
      try {
        rmSync(dbPath, { force: true });
      } catch (e) {}
    },
  },
  {
    name: "postgres",
    displayName: "PostgreSQL",
    match: (cs: string) => cs.startsWith("postgresql://") || cs.startsWith("postgres://"),
    connectionString: dbConnectionString || "postgresql://testuser:testpass@localhost:5432/txls_test",
    setup: async () => {
      process.env.DB_CONNECTION_STRING = dbConnectionString || "postgresql://testuser:testpass@localhost:5432/txls_test";
    },
    teardown: async () => {},
  },
  {
    name: "mysql",
    displayName: "MySQL",
    match: (cs: string) => cs.startsWith("mysql://"),
    connectionString: dbConnectionString || "mysql://testuser:testpass@localhost:3306/txls_test",
    setup: async () => {
      process.env.DB_CONNECTION_STRING = dbConnectionString || "mysql://testuser:testpass@localhost:3306/txls_test";
    },
    teardown: async () => {},
  },
];

const testConfigs = dbConnectionString
  ? allConfigs.filter(c => c.match(dbConnectionString))
  : allConfigs;

describe.each(testConfigs)("$displayName CSV Import Integration", ({ name, displayName, connectionString, setup, teardown }) => {
  const originalDbConnectionString = process.env.DB_CONNECTION_STRING;
  const userId = 1;
  const providerAccountId = 1;

  beforeAll(async () => {
    resetDataSource();
    await setup();
  });

  afterAll(async () => {
    const ds = await getDataSource();
    if (ds && ds.isInitialized) {
      await ds.destroy();
    }
    resetDataSource();
    process.env.DB_CONNECTION_STRING = originalDbConnectionString;
    await teardown();
  });

  afterEach(async () => {
    const ds = await getDataSource();
    await ds.query("DELETE FROM transactions");
  });

  it("should handle timestamps with milliseconds for all database types", async () => {
    const ds = await getDataSource();
    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    const testTimestamp = DateTime.fromISO("2025-01-05T09:30:22.123Z");
    
    const entity = new TransactionEntity();
    entity.userId = userId;
    entity.providerAccountId = providerAccountId;
    entity.externalId = `test-timestamp-${Date.now()}`;
    entity.timestamp = testTimestamp;
    entity.type = TransactionType.buy;
    entity.asset = "BTC";
    entity.quantity = 0.01;
    entity.eurValue = 1000;
    entity.eurFee = 1;
    entity.processed = false;

    const saved = await repository.save(entity);

    expect(saved.timestamp.toMillis()).toBe(testTimestamp.toMillis());
  });

  it("should handle timestamps in year 2025 (exceeds MySQL INT range)", async () => {
    const ds = await getDataSource();
    const repository = new TransactionsRepository(ds);

    const testTimestamp = DateTime.fromISO("2025-01-05T09:30:22");
    
    const entity = new TransactionEntity();
    entity.userId = userId;
    entity.providerAccountId = providerAccountId;
    entity.externalId = `test-2025-${Date.now()}`;
    entity.timestamp = testTimestamp;
    entity.type = TransactionType.buy;
    entity.asset = "BTC";
    entity.quantity = 0.01;
    entity.eurValue = 1000;
    entity.eurFee = 1;
    entity.processed = false;

    const saved = await repository.save(entity);

    expect(saved.timestamp.toMillis()).toBe(testTimestamp.toMillis());
  });

  it("should handle timestamps in year 2026 (exceeds MySQL INT range)", async () => {
    const ds = await getDataSource();
    const repository = new TransactionsRepository(ds);

    const testTimestamp = DateTime.fromISO("2026-02-17T17:51:55");
    
    const entity = new TransactionEntity();
    entity.userId = userId;
    entity.providerAccountId = providerAccountId;
    entity.externalId = `test-2026-${Date.now()}`;
    entity.timestamp = testTimestamp;
    entity.type = TransactionType.sell;
    entity.asset = "SOL";
    entity.quantity = 69.275105;
    entity.eurValue = 15000;
    entity.eurFee = 5;
    entity.processed = false;

    const saved = await repository.save(entity);

    expect(saved.timestamp.toMillis()).toBe(testTimestamp.toMillis());
  });

  it("should handle future timestamps up to year 2030", async () => {
    const ds = await getDataSource();
    const repository = new TransactionsRepository(ds);

    const testTimestamp = DateTime.fromISO("2030-12-31T23:59:59.999Z");
    
    const entity = new TransactionEntity();
    entity.userId = userId;
    entity.providerAccountId = providerAccountId;
    entity.externalId = `test-2030-${Date.now()}`;
    entity.timestamp = testTimestamp;
    entity.type = TransactionType.buy;
    entity.asset = "ETH";
    entity.quantity = 1.5;
    entity.eurValue = 5000;
    entity.eurFee = 10;
    entity.processed = false;

    const saved = await repository.save(entity);

    expect(saved.timestamp.toMillis()).toBe(testTimestamp.toMillis());
  });
});
