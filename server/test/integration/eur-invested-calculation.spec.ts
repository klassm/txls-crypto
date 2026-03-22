import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { rmSync } from "fs";
import path from "path";
import { readFileSync } from "fs";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionsService } from "../../src/modules/transactions/transactions.service.js";
import { AssetHoldingsService } from "../../src/modules/asset-holdings/asset-holdings.service.js";
import { AssetHoldingsRepository } from "../../src/modules/asset-holdings/asset-holdings.repository.js";
import { PricesRepository } from "../../src/modules/prices/prices.repository.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { getProviderConfig } from "../../src/providers/registry.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";

const dbConnectionString = process.env.DB_CONNECTION_STRING;

const allConfigs = [
	{
		name: "better-sqlite3",
		displayName: "SQLite",
		match: (cs: string) => cs.includes(":memory:") || cs.endsWith(".db") || !cs.includes("://"),
		connectionString: dbConnectionString || "./data/test-eur-invested.db",
		setup: async () => {
			process.env.DB_CONNECTION_STRING = dbConnectionString || "./data/test-eur-invested.db";
		},
		teardown: async () => {
			const dbPath = path.join(process.cwd(), "data/test-eur-invested.db");
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
	? allConfigs.filter((c) => c.match(dbConnectionString))
	: allConfigs;

describe.each(testConfigs)("$displayName eurInvested Calculation", ({ displayName, setup, teardown }) => {
	let dataSource: DataSource;
	let userId: number;
	let providerAccountId: number;
	const originalDbConnectionString = process.env.DB_CONNECTION_STRING;

	beforeAll(async () => {
		resetDataSource();
		await setup();
		dataSource = await getDataSource();
	});

	afterAll(async () => {
		if (dataSource && dataSource.isInitialized) {
			await dataSource.destroy();
		}
		resetDataSource();
		process.env.DB_CONNECTION_STRING = originalDbConnectionString;
		await teardown();
	});

	afterEach(async () => {
		if (dataSource && dataSource.isInitialized) {
			await dataSource.query("DELETE FROM asset_holdings");
			await dataSource.query("DELETE FROM transactions");
			await dataSource.query("DELETE FROM provider_accounts");
			await dataSource.query("DELETE FROM users");
		}
	});

	const createUserAndAccount = async () => {
		const userRepo = dataSource.getRepository(UserEntity);
		const user = new UserEntity();
		user.name = "Test User";
		user.username = "testuser";
		user.email = "test@example.com";
		user.password = "hashedpassword123";
		user.isAdmin = false;
		await userRepo.save(user);
		userId = user.id;

		const accountRepo = dataSource.getRepository(AccountEntity);
		const account = new AccountEntity();
		account.userId = user.id;
		account.provider = ProviderType.Bitpanda;
		await accountRepo.save(account);
		providerAccountId = account.id;
	};

	describe("Basic eurInvested calculation", () => {
		beforeEach(createUserAndAccount);

		it("should correctly calculate eurInvested for buy transactions", async () => {
			const repository = new TransactionsRepository(dataSource);
			const service = new TransactionsService(repository);

			const tx1 = new TransactionEntity();
			tx1.userId = userId;
			tx1.providerAccountId = providerAccountId;
			tx1.externalId = "buy-1";
			tx1.type = TransactionType.buy;
			tx1.asset = "BTC";
			tx1.quantity = 1.0;
			tx1.eurValue = 50000;
			tx1.eurFee = 0;
			tx1.timestamp = DateTime.utc();
			tx1.processed = false;

			const tx2 = new TransactionEntity();
			tx2.userId = userId;
			tx2.providerAccountId = providerAccountId;
			tx2.externalId = "buy-2";
			tx2.type = TransactionType.buy;
			tx2.asset = "ETH";
			tx2.quantity = 10.0;
			tx2.eurValue = 30000;
			tx2.eurFee = 0;
			tx2.timestamp = DateTime.utc();
			tx2.processed = false;

			await repository.saveMany([tx1, tx2]);

			const holdingsRepo = new AssetHoldingsRepository(dataSource);
			const pricesRepo = new PricesRepository(dataSource);
			const holdingsService = new AssetHoldingsService(dataSource, holdingsRepo, pricesRepo);
			await holdingsService.rebuildHoldings(userId, providerAccountId);

			const holdings = await holdingsRepo.findLatestByAccount(userId, providerAccountId);

			expect(holdings.size).toBe(2);
			expect(holdings.get("BTC")?.eurInvested).toBe(50000);
			expect(holdings.get("ETH")?.eurInvested).toBe(30000);

			const totalEurInvested = Array.from(holdings.values()).reduce((sum, h) => sum + h.eurInvested, 0);
			expect(totalEurInvested).toBe(80000);
		});

		it("should include deposit eurValue in eurInvested", async () => {
			const repository = new TransactionsRepository(dataSource);

			const tx1 = new TransactionEntity();
			tx1.userId = userId;
			tx1.providerAccountId = providerAccountId;
			tx1.externalId = "buy-1";
			tx1.type = TransactionType.buy;
			tx1.asset = "BTC";
			tx1.quantity = 1.0;
			tx1.eurValue = 50000;
			tx1.eurFee = 0;
			tx1.timestamp = DateTime.utc();
			tx1.processed = false;

			const tx2 = new TransactionEntity();
			tx2.userId = userId;
			tx2.providerAccountId = providerAccountId;
			tx2.externalId = "deposit-1";
			tx2.type = TransactionType.deposit;
			tx2.asset = "ETH";
			tx2.quantity = 5.0;
			tx2.eurValue = 15000;
			tx2.eurFee = 0;
			tx2.timestamp = DateTime.utc();
			tx2.processed = false;

			await repository.saveMany([tx1, tx2]);

			const holdingsRepo = new AssetHoldingsRepository(dataSource);
			const pricesRepo = new PricesRepository(dataSource);
			const holdingsService = new AssetHoldingsService(dataSource, holdingsRepo, pricesRepo);
			await holdingsService.rebuildHoldings(userId, providerAccountId);

			const holdings = await holdingsRepo.findLatestByAccount(userId, providerAccountId);

			expect(holdings.get("BTC")?.eurInvested).toBe(50000);
			expect(holdings.get("ETH")?.eurInvested).toBe(15000);

			const totalEurInvested = Array.from(holdings.values()).reduce((sum, h) => sum + h.eurInvested, 0);
			expect(totalEurInvested).toBe(65000);
		});

		it("should NOT include reward eurValue in eurInvested", async () => {
			const repository = new TransactionsRepository(dataSource);

			const tx1 = new TransactionEntity();
			tx1.userId = userId;
			tx1.providerAccountId = providerAccountId;
			tx1.externalId = "buy-1";
			tx1.type = TransactionType.buy;
			tx1.asset = "SOL";
			tx1.quantity = 10.0;
			tx1.eurValue = 1000;
			tx1.eurFee = 0;
			tx1.timestamp = DateTime.utc();
			tx1.processed = false;

			const tx2 = new TransactionEntity();
			tx2.userId = userId;
			tx2.providerAccountId = providerAccountId;
			tx2.externalId = "reward-1";
			tx2.type = TransactionType.reward;
			tx2.asset = "SOL";
			tx2.quantity = 1.0;
			tx2.eurValue = 100;
			tx2.eurFee = 0;
			tx2.timestamp = DateTime.utc();
			tx2.processed = false;

			await repository.saveMany([tx1, tx2]);

			const holdingsRepo = new AssetHoldingsRepository(dataSource);
			const pricesRepo = new PricesRepository(dataSource);
			const holdingsService = new AssetHoldingsService(dataSource, holdingsRepo, pricesRepo);
			await holdingsService.rebuildHoldings(userId, providerAccountId);

			const holdings = await holdingsRepo.findLatestByAccount(userId, providerAccountId);

			expect(holdings.get("SOL")?.amount).toBe(10);
			expect(holdings.get("SOL")?.eurInvested).toBe(1000);
		});

		it("should reduce eurInvested proportionally when selling", async () => {
			const repository = new TransactionsRepository(dataSource);

			const tx1 = new TransactionEntity();
			tx1.userId = userId;
			tx1.providerAccountId = providerAccountId;
			tx1.externalId = "buy-1";
			tx1.type = TransactionType.buy;
			tx1.asset = "BTC";
			tx1.quantity = 2.0;
			tx1.eurValue = 100000;
			tx1.eurFee = 0;
			tx1.timestamp = DateTime.utc().minus({ days: 1 });
			tx1.processed = false;

			const tx2 = new TransactionEntity();
			tx2.userId = userId;
			tx2.providerAccountId = providerAccountId;
			tx2.externalId = "sell-1";
			tx2.type = TransactionType.sell;
			tx2.asset = "BTC";
			tx2.quantity = 1.0;
			tx2.eurValue = 55000;
			tx2.eurFee = 0;
			tx2.timestamp = DateTime.utc();
			tx2.processed = false;

			await repository.saveMany([tx1, tx2]);

			const holdingsRepo = new AssetHoldingsRepository(dataSource);
			const pricesRepo = new PricesRepository(dataSource);
			const holdingsService = new AssetHoldingsService(dataSource, holdingsRepo, pricesRepo);
			await holdingsService.rebuildHoldings(userId, providerAccountId);

			const holdings = await holdingsRepo.findLatestByAccount(userId, providerAccountId);

			expect(holdings.get("BTC")?.amount).toBe(1.0);
			expect(holdings.get("BTC")?.eurInvested).toBe(50000);
		});
	});

	describe("Full CSV import flow", () => {
		beforeEach(createUserAndAccount);

		it("should correctly calculate eurInvested for test Bitpanda CSV", async () => {
			const csvContent = readFileSync(
				path.join(process.cwd(), "../test-data/test-bitpanda.csv"),
				"utf-8"
			);

			const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
			const parseResult = csvImporter.parseCsv(csvContent, providerAccountId);

			const repository = new TransactionsRepository(dataSource);
			const service = new TransactionsService(repository);
			const importResult = await service.importTransactions(userId, providerAccountId, parseResult.transactions);

			expect(importResult.imported).toBeGreaterThan(0);

			const holdingsRepo = new AssetHoldingsRepository(dataSource);
			const pricesRepo = new PricesRepository(dataSource);
			const holdingsService = new AssetHoldingsService(dataSource, holdingsRepo, pricesRepo);
			await holdingsService.rebuildHoldings(userId, providerAccountId);

			const holdings = await holdingsRepo.findLatestByAccount(userId, providerAccountId);

			const savedTx = await repository.findByProviderAccountId(userId, providerAccountId);
			const buyTx = savedTx.filter((tx) => tx.type === TransactionType.buy);
			const depositTx = savedTx.filter((tx) => tx.type === TransactionType.deposit);

			expect(buyTx.length).toBe(1);
			expect(depositTx.length).toBe(0);

			const totalEurInvested = Array.from(holdings.values()).reduce((sum, h) => sum + h.eurInvested, 0);
			expect(totalEurInvested).toBe(1000);
		});

		it("should correctly handle transaction type string comparison", async () => {
			const repository = new TransactionsRepository(dataSource);

			const tx = new TransactionEntity();
			tx.userId = userId;
			tx.providerAccountId = providerAccountId;
			tx.externalId = "type-test-buy";
			tx.type = TransactionType.buy;
			tx.asset = "BTC";
			tx.quantity = 1.0;
			tx.eurValue = 50000;
			tx.eurFee = 0;
			tx.timestamp = DateTime.utc();
			tx.processed = false;

			await repository.save(tx);

			const saved = await repository.findOneByExternalId(userId, "type-test-buy");
			
			expect(saved).not.toBeNull();
			expect(saved!.type).toBe("buy");
			expect(saved!.type).toBe(TransactionType.buy);
			expect(saved!.type === TransactionType.buy).toBe(true);

			const txDeposit = new TransactionEntity();
			txDeposit.userId = userId;
			txDeposit.providerAccountId = providerAccountId;
			txDeposit.externalId = "type-test-deposit";
			txDeposit.type = TransactionType.deposit;
			txDeposit.asset = "ETH";
			txDeposit.quantity = 5.0;
			txDeposit.eurValue = 15000;
			txDeposit.eurFee = 0;
			txDeposit.timestamp = DateTime.utc();
			txDeposit.processed = false;

			await repository.save(txDeposit);

			const savedDeposit = await repository.findOneByExternalId(userId, "type-test-deposit");
			expect(savedDeposit!.type).toBe("deposit");
			expect(savedDeposit!.type).toBe(TransactionType.deposit);
			expect(savedDeposit!.type === TransactionType.deposit).toBe(true);
		});
	});

	describe("Production CSV verification", () => {
		beforeEach(createUserAndAccount);

		it("should correctly calculate eurInvested for production Bitpanda CSV", async () => {
			const csvPath = path.join(process.cwd(), "../bitpanda-trades-2026-03-15-10-28.csv");
			
			let csvContent: string;
			try {
				csvContent = readFileSync(csvPath, "utf-8");
			} catch {
				console.log("Skipping production CSV test - file not found");
				return;
			}

			const csvImporter = getProviderConfig(ProviderType.Bitpanda).csvImporter!;
			const parseResult = csvImporter.parseCsv(csvContent, providerAccountId);

			const repository = new TransactionsRepository(dataSource);
			const service = new TransactionsService(repository);
			const importResult = await service.importTransactions(userId, providerAccountId, parseResult.transactions);

			console.log(`Imported ${importResult.imported} transactions`);
			console.log(`Errors: ${importResult.errors.length}`);

			const savedTx = await repository.findByProviderAccountId(userId, providerAccountId);
			console.log(`Total saved transactions: ${savedTx.length}`);

			const buyTx = savedTx.filter((tx) => tx.type === TransactionType.buy);
			const depositTx = savedTx.filter((tx) => tx.type === TransactionType.deposit);
			const rewardTx = savedTx.filter((tx) => tx.type === TransactionType.reward);

			console.log(`Buy transactions: ${buyTx.length}`);
			console.log(`Deposit transactions: ${depositTx.length}`);
			console.log(`Reward transactions: ${rewardTx.length}`);

			const totalBuyEurValue = buyTx.reduce((sum, tx) => sum + Number(tx.eurValue), 0);
			const totalDepositEurValue = depositTx.reduce((sum, tx) => sum + Number(tx.eurValue), 0);
			const totalRewardEurValue = rewardTx.reduce((sum, tx) => sum + Number(tx.eurValue), 0);

			console.log(`Total buy EUR value: ${totalBuyEurValue}`);
			console.log(`Total deposit EUR value: ${totalDepositEurValue}`);
			console.log(`Total reward EUR value: ${totalRewardEurValue}`);

			const holdingsRepo = new AssetHoldingsRepository(dataSource);
			const pricesRepo = new PricesRepository(dataSource);
			const holdingsService = new AssetHoldingsService(dataSource, holdingsRepo, pricesRepo);
			await holdingsService.rebuildHoldings(userId, providerAccountId);

			const holdings = await holdingsRepo.findLatestByAccount(userId, providerAccountId);

			const totalEurInvested = Array.from(holdings.values()).reduce((sum, h) => sum + h.eurInvested, 0);
			console.log(`Total eurInvested: ${totalEurInvested}`);

			const expectedEurInvested = totalBuyEurValue + totalDepositEurValue;
			console.log(`Expected eurInvested (buys + deposits): ${expectedEurInvested}`);

			expect(buyTx.length).toBe(25);
			expect(depositTx.length).toBe(6);
			expect(totalEurInvested).toBeCloseTo(expectedEurInvested, 2);
			expect(totalEurInvested).toBeCloseTo(118151.22, -1);
		});
	});
});
