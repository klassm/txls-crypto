import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { AccountsRepository } from "../../src/modules/accounts/accounts.repository.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionsService } from "../../src/modules/transactions/transactions.service.js";
import { ImportDeduplicationService } from "../../src/providers/import-deduplication.service.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { ProviderType, TransactionType, type Transaction } from "@txls/shared";
import { DateTime } from "luxon";
import { BitpandaImporter } from "../../src/providers/bitpanda/importer.js";
import { getProviderConfig } from "../../src/providers/registry.js";

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

describe.each(testConfigs)("$displayName CSV Import Endpoint Integration", ({ name, displayName, connectionString, setup, teardown }) => {
  const originalDbConnectionString = process.env.DB_CONNECTION_STRING;
  let userId: number;
  let accountId: number;

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
    await ds.query("DELETE FROM provider_accounts");
    await ds.query("DELETE FROM users");
  });

  beforeEach(async () => {
    const ds = await getDataSource();

    const usersRepository = ds.getRepository(UserEntity);
    const user = new UserEntity();
    user.name = "Test User";
    user.username = `testuser-${Date.now()}`;
    user.password = "hashedpassword";
    user.isAdmin = false;
    user.createdAt = DateTime.now();
    user.updatedAt = DateTime.now();
    const savedUser = await usersRepository.save(user);
    userId = savedUser.id;

    const accountsRepository = new AccountsRepository(ds);
    const account = new AccountEntity();
    account.userId = userId;
    account.provider = ProviderType.Bitpanda;
    account.createdAt = DateTime.now();
    account.updatedAt = DateTime.now();
    const savedAccount = await accountsRepository.save(account);
    accountId = savedAccount.id;
  });

  it("should import CSV transactions with eurRate field", async () => {
    const ds = await getDataSource();
    const csvContent = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,1000,EUR,0.05,BTC,20000,EUR,Cryptocurrency,BTC,5.00,EUR,0.5,0.5,EUR,0`;

    const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
    const parseResult = csvImporter.parseCsv(csvContent, accountId);

    expect(parseResult.transactions).toHaveLength(1);
    expect(parseResult.transactions[0].eurRate).toBe(20000);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    const result = await service.importTransactions(userId, accountId, parseResult.transactions);

    expect(result.imported).toBe(1);

    const saved = await repository.findByProviderAccountId(userId, accountId);
    expect(saved).toHaveLength(1);
    expect(Number(saved[0].eurRate)).toBe(20000);
    expect(Number(saved[0].eurValue)).toBe(1000);
    expect(Number(saved[0].quantity)).toBe(0.05);
  });

  it("should handle multiple transactions with different eurRates", async () => {
    const ds = await getDataSource();
    const csvContent = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T11111,2026-02-19 20:00:00,buy,outgoing,1000,EUR,0.05,BTC,20000,EUR,Cryptocurrency,BTC,5.00,EUR,0.5,0.5,EUR,0
T22222,2026-02-19 19:00:00,buy,outgoing,500,EUR,0.5,ETH,1000,EUR,Cryptocurrency,ETH,2.50,EUR,0.5,0.5,EUR,0
T33333,2026-02-19 18:00:00,sell,incoming,100,EUR,1,SOL,100,EUR,Cryptocurrency,SOL,0.50,EUR,0.5,0.5,EUR,0`;

    const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
    const parseResult = csvImporter.parseCsv(csvContent, accountId);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    await service.importTransactions(userId, accountId, parseResult.transactions);

    const saved = await repository.findByProviderAccountId(userId, accountId);
    expect(saved).toHaveLength(3);

    const btcTx = saved.find(t => t.asset === "BTC");
    const ethTx = saved.find(t => t.asset === "ETH");
    const solTx = saved.find(t => t.asset === "SOL");

    expect(Number(btcTx?.eurRate)).toBe(20000);
    expect(Number(ethTx?.eurRate)).toBe(1000);
    expect(Number(solTx?.eurRate)).toBe(100);
  });

  it("should persist eurRate correctly to database with high precision", async () => {
    const ds = await getDataSource();
    const repository = new TransactionsRepository(ds);

    const tx: Transaction = {
      id: 0,
      providerAccountId: accountId,
      externalId: `test-persist-${Date.now()}`,
      timestamp: DateTime.fromISO("2026-03-10T10:00:00"),
      type: TransactionType.buy,
      asset: "BTC",
      quantity: 1.5,
      eurValue: 50000,
      eurFee: 10,
      eurRate: 33333.33333333,
      processed: false,
    };

    const service = new TransactionsService(repository);
    await service.importTransactions(userId, accountId, [tx]);

    const saved = await repository.findByProviderAccountId(userId, accountId);
    expect(saved).toHaveLength(1);
    expect(Number(saved[0].eurRate)).toBeCloseTo(33333.33333333, 5);
  });

  it("should handle deduplication with eurRate field", async () => {
    const ds = await getDataSource();
    const csvContent = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,1000,EUR,0.05,BTC,20000,EUR,Cryptocurrency,BTC,5.00,EUR,0.5,0.5,EUR,0`;

    const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
    const parseResult = csvImporter.parseCsv(csvContent, accountId);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    await service.importTransactions(userId, accountId, parseResult.transactions);

    const dedupService = new ImportDeduplicationService(repository);
    dedupService.setUserId(userId);
    const dedupResult = await dedupService.shouldSkipOrReplace(accountId, parseResult.transactions);

    expect(dedupResult.shouldSkip).toBe(true);
    expect(dedupResult.count).toBe(1);
  });

  it("should handle zero eurRate for reward transactions", async () => {
    const ds = await getDataSource();
    const csvContent = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
1f08817f-db22-662e-8da0-255f38e9fac2,2025-09-02T18:15:07+02:00,reward,incoming,2.12,EUR,0.00057409,ETH,3692.80,EUR,Cryptocurrency,5,-,-,-,-,-`;

    const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
    const parseResult = csvImporter.parseCsv(csvContent, accountId);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    await service.importTransactions(userId, accountId, parseResult.transactions);

    const saved = await repository.findByProviderAccountId(userId, accountId);
    expect(saved).toHaveLength(1);
    expect(Number(saved[0].eurRate)).toBe(3692.80);
  });

  it("should correctly map Asset market price to eurRate for sell transactions", async () => {
    const ds = await getDataSource();
    const csvContent = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T67890,2026-02-19 19:00:00,sell,incoming,500,EUR,0.025,BTC,20000,EUR,Cryptocurrency,BTC,2.50,EUR,0.5,0.5,EUR,0`;

    const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
    const parseResult = csvImporter.parseCsv(csvContent, accountId);

    const repository = new TransactionsRepository(ds);
    const service = new TransactionsService(repository);

    await service.importTransactions(userId, accountId, parseResult.transactions);

    const saved = await repository.findByProviderAccountId(userId, accountId);
    expect(saved).toHaveLength(1);
    expect(Number(saved[0].eurRate)).toBe(20000);
    expect(saved[0].type).toBe(TransactionType.sell);
  });
});
