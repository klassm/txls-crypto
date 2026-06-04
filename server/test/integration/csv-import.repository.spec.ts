import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionsService } from "../../src/modules/transactions/transactions.service.js";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { getProviderConfig } from "../../src/providers/registry.js";
import { ProviderType } from "@txls/shared";

const dbConnectionString = process.env.DB_CONNECTION_STRING;

const allConfigs = [
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
    match: (cs: string) => cs.startsWith("mysql://") || cs.startsWith("mariadb://"),
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

describe.each(testConfigs)("$displayName CSV Import Repository Integration", ({ name, displayName, connectionString, setup, teardown }) => {
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

  it("should import Bitpanda CSV with 2025 timestamps", async () => {
    const ds = await getDataSource();
    const csvContent = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T2025-001,2025-01-05 09:30:22,buy,outgoing,1000,EUR,0.01,BTC,100000,EUR,Cryptocurrency,BTC,5.00,EUR,0.5,0.5,EUR,0
T2025-002,2025-06-15 14:30:00,buy,outgoing,500,EUR,2.5,ETH,200,EUR,Cryptocurrency,ETH,2.50,EUR,0.5,0.5,EUR,0
T2026-001,2026-01-10 10:00:00,sell,incoming,2000,EUR,0.02,BTC,100000,EUR,Cryptocurrency,BTC,10.00,EUR,0.5,0.5,EUR,0`;

    const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
    const parseResult = csvImporter.parseCsv(csvContent, providerAccountId);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    const result = await service.importTransactions(userId, providerAccountId, parseResult.transactions);

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    const saved = await repository.findByProviderAccountId(userId, providerAccountId);
    expect(saved).toHaveLength(3);

    const sorted = [...saved].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    expect(sorted[0].timestamp.year).toBe(2025);
    expect(sorted[1].timestamp.year).toBe(2025);
    expect(sorted[2].timestamp.year).toBe(2026);
  });

  it("should import TradeRepublic CSV with 2025 timestamps", async () => {
    const ds = await getDataSource();
    const csvContent = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-05T09:30:22;Buy;-1000.00;;XF000BTC0017;0.010376;0.00;0.00;;
2025-02-17T17:51:55;Buy;-15000.00;;XF000SOL0012;69.275105;0.00;0.00;;
2026-01-02T07:45:03;Buy;-2500.00;;XF000SOL0012;1.798273;0.00;0.00;;`;

    const csvImporter = getProviderConfig(ProviderType.TradeRepublic).csvImporter;
    if (!csvImporter) {
      return;
    }

    const parseResult = csvImporter.parseCsv(csvContent, providerAccountId);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    const result = await service.importTransactions(userId, providerAccountId, parseResult.transactions);

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    const saved = await repository.findByProviderAccountId(userId, providerAccountId);
    expect(saved).toHaveLength(3);

    const sorted = [...saved].sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    expect(sorted[0].timestamp.year).toBe(2025);
    expect(sorted[1].timestamp.year).toBe(2025);
    expect(sorted[2].timestamp.year).toBe(2026);
  });

  it("should get available years from transactions (handles string timestamps from PostgreSQL/MySQL)", async () => {
    const ds = await getDataSource();
    const repository = new TransactionsRepository(ds);

    const transactions = [
      Object.assign(new TransactionEntity(), {
        userId,
        providerAccountId,
        externalId: "YEAR-2025-1",
        timestamp: DateTime.fromISO("2025-03-15T10:00:00Z"),
        type: TransactionType.buy,
        asset: "BTC",
        quantity: 0.1,
        eurValue: 5000,
        eurFee: 10,
        processed: false,
      }),
      Object.assign(new TransactionEntity(), {
        userId,
        providerAccountId,
        externalId: "YEAR-2026-1",
        timestamp: DateTime.fromISO("2026-01-10T14:00:00Z"),
        type: TransactionType.buy,
        asset: "ETH",
        quantity: 1.0,
        eurValue: 3000,
        eurFee: 5,
        processed: false,
      }),
      Object.assign(new TransactionEntity(), {
        userId,
        providerAccountId,
        externalId: "YEAR-2024-1",
        timestamp: DateTime.fromISO("2024-06-20T09:00:00Z"),
        type: TransactionType.sell,
        asset: "SOL",
        quantity: 10,
        eurValue: 1000,
        eurFee: 2,
        processed: false,
      }),
    ];

    await repository.saveMany(transactions);

    const years = await repository.getAvailableYears(userId, providerAccountId);

    expect(years).toHaveLength(3);
    expect(years).toContain(2024);
    expect(years).toContain(2025);
    expect(years).toContain(2026);
    expect(years[0]).toBe(2026);
    expect(years[2]).toBe(2024);
  });
});
