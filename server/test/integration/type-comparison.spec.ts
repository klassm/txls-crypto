import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { rmSync } from "fs";
import path from "path";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { TransactionType, ProviderType } from "@txls/shared";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";

const dbConnectionString = process.env.DB_CONNECTION_STRING;

const allConfigs = [
	{
		name: "better-sqlite3",
		displayName: "SQLite",
		match: (cs: string) => cs.includes(":memory:") || cs.endsWith(".db") || !cs.includes("://"),
		connectionString: dbConnectionString || "./data/test-type-comparison.db",
		setup: async () => {
			process.env.DB_CONNECTION_STRING = dbConnectionString || "./data/test-type-comparison.db";
		},
		teardown: async () => {
			const dbPath = path.join(process.cwd(), "data/test-type-comparison.db");
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

describe.each(testConfigs)("$displayName TransactionType Comparison", ({ displayName, connectionString, setup, teardown }) => {
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

	describe("Enum value verification", () => {
		it("should have correct enum values", () => {
			expect(TransactionType.buy).toBe("buy");
			expect(TransactionType.sell).toBe("sell");
			expect(TransactionType.deposit).toBe("deposit");
			expect(TransactionType.withdrawal).toBe("withdrawal");
			expect(TransactionType.reward).toBe("reward");
		});
	});

	describe("Type storage and retrieval", () => {
		beforeEach(createUserAndAccount);

		it("should store and retrieve buy type correctly", async () => {
			const tx = new TransactionEntity();
			tx.userId = userId;
			tx.providerAccountId = providerAccountId;
			tx.externalId = "test-buy-1";
			tx.type = TransactionType.buy;
			tx.asset = "BTC";
			tx.quantity = 1.0;
			tx.eurValue = 50000;
			tx.eurFee = 0;
			tx.timestamp = DateTime.utc();
			tx.processed = false;

			const saved = await dataSource.getRepository(TransactionEntity).save(tx);

			expect(saved.type).toBe("buy");
			expect(saved.type).toBe(TransactionType.buy);
			expect(saved.type === TransactionType.buy).toBe(true);
		});

		it("should store and retrieve deposit type correctly", async () => {
			const tx = new TransactionEntity();
			tx.userId = userId;
			tx.providerAccountId = providerAccountId;
			tx.externalId = "test-deposit-1";
			tx.type = TransactionType.deposit;
			tx.asset = "ETH";
			tx.quantity = 5.0;
			tx.eurValue = 15000;
			tx.eurFee = 0;
			tx.timestamp = DateTime.utc();
			tx.processed = false;

			const saved = await dataSource.getRepository(TransactionEntity).save(tx);

			expect(saved.type).toBe("deposit");
			expect(saved.type).toBe(TransactionType.deposit);
			expect(saved.type === TransactionType.deposit).toBe(true);
		});

		it("should store and retrieve reward type correctly", async () => {
			const tx = new TransactionEntity();
			tx.userId = userId;
			tx.providerAccountId = providerAccountId;
			tx.externalId = "test-reward-1";
			tx.type = TransactionType.reward;
			tx.asset = "SOL";
			tx.quantity = 1.0;
			tx.eurValue = 100;
			tx.eurFee = 0;
			tx.timestamp = DateTime.utc();
			tx.processed = false;

			const saved = await dataSource.getRepository(TransactionEntity).save(tx);

			expect(saved.type).toBe("reward");
			expect(saved.type).toBe(TransactionType.reward);
			expect(saved.type === TransactionType.reward).toBe(true);
		});
	});

	describe("Type comparison after query", () => {
		beforeEach(createUserAndAccount);

		it("should correctly compare type after fetching from database", async () => {
			const txRepo = dataSource.getRepository(TransactionEntity);

			const tx = new TransactionEntity();
			tx.userId = userId;
			tx.providerAccountId = providerAccountId;
			tx.externalId = "test-comparison-1";
			tx.type = TransactionType.buy;
			tx.asset = "BTC";
			tx.quantity = 1.0;
			tx.eurValue = 50000;
			tx.eurFee = 0;
			tx.timestamp = DateTime.utc();
			tx.processed = false;

			await txRepo.save(tx);

			const fetched = await txRepo.findOne({
				where: { externalId: "test-comparison-1" },
			});

			expect(fetched).not.toBeNull();

			console.log(`[${displayName}] Type value: "${fetched!.type}"`);
			console.log(`[${displayName}] Type typeof: "${typeof fetched!.type}"`);
			console.log(`[${displayName}] TransactionType.buy: "${TransactionType.buy}"`);
			console.log(`[${displayName}] TransactionType.buy typeof: "${typeof TransactionType.buy}"`);
			console.log(`[${displayName}] Direct comparison: ${fetched!.type === TransactionType.buy}`);
			console.log(`[${displayName}] JSON.stringify type: ${JSON.stringify(fetched!.type)}`);
			console.log(`[${displayName}] JSON.stringify enum: ${JSON.stringify(TransactionType.buy)}`);

			expect(fetched!.type).toBe("buy");
			expect(fetched!.type).toBe(TransactionType.buy);
			expect(fetched!.type === TransactionType.buy).toBe(true);
		});

		it("should correctly compare all transaction types after fetching", async () => {
			const txRepo = dataSource.getRepository(TransactionEntity);

			const types = [
				TransactionType.buy,
				TransactionType.sell,
				TransactionType.deposit,
				TransactionType.withdrawal,
				TransactionType.reward,
			];

			for (const type of types) {
				const tx = new TransactionEntity();
				tx.userId = userId;
				tx.providerAccountId = providerAccountId;
				tx.externalId = `test-${type}-multi`;
				tx.type = type;
				tx.asset = "BTC";
				tx.quantity = 1.0;
				tx.eurValue = 100;
				tx.eurFee = 0;
				tx.timestamp = DateTime.utc();
				tx.processed = false;

				await txRepo.save(tx);
			}

			const fetched = await txRepo.find({
				where: { providerAccountId },
			});

			expect(fetched.length).toBe(5);

			for (const tx of fetched) {
				const enumValue = types.find((t) => t === tx.type);
				expect(enumValue).toBeDefined();
				expect(tx.type === enumValue).toBe(true);
			}
		});
	});

	describe("QueryBuilder type comparison", () => {
		beforeEach(createUserAndAccount);

		it("should correctly compare types when fetched via QueryBuilder", async () => {
			const txRepo = dataSource.getRepository(TransactionEntity);

			const tx1 = new TransactionEntity();
			tx1.userId = userId;
			tx1.providerAccountId = providerAccountId;
			tx1.externalId = "qb-buy-1";
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
			tx2.externalId = "qb-deposit-1";
			tx2.type = TransactionType.deposit;
			tx2.asset = "ETH";
			tx2.quantity = 5.0;
			tx2.eurValue = 15000;
			tx2.eurFee = 0;
			tx2.timestamp = DateTime.utc();
			tx2.processed = false;

			await txRepo.save([tx1, tx2]);

			const transactions = await txRepo
				.createQueryBuilder("tx")
				.where("tx.userId = :userId AND tx.providerAccountId = :providerAccountId", {
					userId,
					providerAccountId,
				})
				.getMany();

			expect(transactions.length).toBe(2);

			const buyTx = transactions.find((t) => t.externalId === "qb-buy-1");
			const depositTx = transactions.find((t) => t.externalId === "qb-deposit-1");

			expect(buyTx).toBeDefined();
			expect(depositTx).toBeDefined();

			console.log(`[${displayName}] QueryBuilder buy type: "${buyTx!.type}"`);
			console.log(`[${displayName}] QueryBuilder buy comparison: ${buyTx!.type === TransactionType.buy}`);

			expect(buyTx!.type === TransactionType.buy).toBe(true);
			expect(depositTx!.type === TransactionType.deposit).toBe(true);

			const buyOrDeposit = transactions.filter(
				(t) => t.type === TransactionType.buy || t.type === TransactionType.deposit
			);
			expect(buyOrDeposit.length).toBe(2);
		});
	});

	describe("Type in WHERE clause", () => {
		beforeEach(createUserAndAccount);

		it("should correctly filter by type in QueryBuilder", async () => {
			const txRepo = dataSource.getRepository(TransactionEntity);

			const tx1 = new TransactionEntity();
			tx1.userId = userId;
			tx1.providerAccountId = providerAccountId;
			tx1.externalId = "where-buy-1";
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
			tx2.externalId = "where-reward-1";
			tx2.type = TransactionType.reward;
			tx2.asset = "SOL";
			tx2.quantity = 1.0;
			tx2.eurValue = 100;
			tx2.eurFee = 0;
			tx2.timestamp = DateTime.utc();
			tx2.processed = false;

			await txRepo.save([tx1, tx2]);

			const buyTransactions = await txRepo
				.createQueryBuilder("tx")
				.where("tx.userId = :userId", { userId })
				.andWhere("tx.type = :type", { type: TransactionType.buy })
				.getMany();

			expect(buyTransactions.length).toBe(1);
			expect(buyTransactions[0].externalId).toBe("where-buy-1");

			const buyOrDeposit = await txRepo
				.createQueryBuilder("tx")
				.where("tx.userId = :userId", { userId })
				.andWhere("tx.type IN (:...types)", { types: [TransactionType.buy, TransactionType.deposit] })
				.getMany();

			expect(buyOrDeposit.length).toBe(1);
		});
	});
});
