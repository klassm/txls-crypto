import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { AssetHoldingsRepository } from "../../src/modules/asset-holdings/asset-holdings.repository.js";
import { AssetHoldingEntity } from "../../src/modules/asset-holdings/asset-holding.entity.js";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";

describe("AssetHoldings Repository Integration", () => {
	let dataSource: DataSource;
	let repository: AssetHoldingsRepository;
	const userId = 1;
	const accountId1 = 100;
	const accountId2 = 200;

	beforeAll(async () => {
		process.env.DB_CONNECTION_STRING = ":memory:";
		resetDataSource();
		dataSource = await getDataSource();
		repository = new AssetHoldingsRepository(dataSource);
	});

	afterAll(async () => {
		if (dataSource && dataSource.isInitialized) {
			await dataSource.destroy();
		}
		resetDataSource();
	});

	beforeEach(async () => {
		await dataSource.getRepository(AssetHoldingEntity).clear();
	});

	describe("findLatestByAccount", () => {
		it("should return empty map when no holdings exist", async () => {
			const result = await repository.findLatestByAccount(userId, accountId1);
			expect(result.size).toBe(0);
		});

		it("should return latest holdings for each asset", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.5, eurInvested: 75000, timestamp: now } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByAccount(userId, accountId1);

			expect(result.size).toBe(2);
			expect(result.get("BTC")?.amount).toBe(1.5);
			expect(result.get("BTC")?.eurInvested).toBe(75000);
			expect(result.get("ETH")?.amount).toBe(10.0);
		});

		it("should return holdings with different timestamps", async () => {
			const now = DateTime.utc();
			const twoDaysAgo = now.minus({ days: 2 });
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: twoDaysAgo } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "SOL", amount: 100.0, eurInvested: 10000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByAccount(userId, accountId1);

			expect(result.size).toBe(3);
			expect(result.has("BTC")).toBe(true);
			expect(result.has("ETH")).toBe(true);
			expect(result.has("SOL")).toBe(true);
		});

		it("should not return holdings from other accounts", async () => {
			const now = DateTime.utc();

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId2, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByAccount(userId, accountId1);

			expect(result.size).toBe(1);
			expect(result.has("BTC")).toBe(true);
			expect(result.has("ETH")).toBe(false);
		});

		it("should not return holdings from other users", async () => {
			const now = DateTime.utc();
			const otherUserId = 999;

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId: otherUserId, providerAccountId: accountId1, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByAccount(userId, accountId1);

			expect(result.size).toBe(1);
			expect(result.has("BTC")).toBe(true);
			expect(result.has("ETH")).toBe(false);
		});
	});

	describe("findLatestByUser", () => {
		it("should return empty map when no holdings exist", async () => {
			const result = await repository.findLatestByUser(userId);
			expect(result.size).toBe(0);
		});

		it("should return holdings grouped by account", async () => {
			const now = DateTime.utc();

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId2, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByUser(userId);

			expect(result.size).toBe(2);
			expect(result.get(accountId1)?.has("BTC")).toBe(true);
			expect(result.get(accountId2)?.has("ETH")).toBe(true);
		});

		it("should return latest holdings when multiple entries exist for same asset", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 2.0, eurInvested: 100000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByUser(userId);

			expect(result.size).toBe(1);
			expect(result.get(accountId1)?.get("BTC")?.amount).toBe(2.0);
		});

		it("should not return holdings from other users", async () => {
			const now = DateTime.utc();
			const otherUserId = 999;

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId: otherUserId, providerAccountId: accountId2, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.findLatestByUser(userId);

			expect(result.size).toBe(1);
			expect(result.has(accountId1)).toBe(true);
			expect(result.has(accountId2)).toBe(false);
		});
	});

	describe("getHoldingsUpToTimestamp", () => {
		it("should return holdings at or before timestamp", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });
			const twoDaysAgo = now.minus({ days: 2 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: twoDaysAgo } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "SOL", amount: 100.0, eurInvested: 10000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.getHoldingsUpToTimestamp(userId, accountId1, yesterday);

			expect(result.size).toBe(2);
			expect(result.has("BTC")).toBe(true);
			expect(result.has("ETH")).toBe(true);
			expect(result.has("SOL")).toBe(false);
		});

		it("should return latest holdings at or before timestamp", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });
			const twoDaysAgo = now.minus({ days: 2 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: twoDaysAgo } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.5, eurInvested: 75000, timestamp: yesterday } as AssetHoldingEntity,
			]);

			const result = await repository.getHoldingsUpToTimestamp(userId, accountId1, yesterday);

			expect(result.size).toBe(1);
			expect(result.get("BTC")?.amount).toBe(1.5);
		});

		it("should return empty map when no holdings exist before timestamp", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.getHoldingsUpToTimestamp(userId, accountId1, yesterday);

			expect(result.size).toBe(0);
		});
	});

	describe("getAllHoldingsUpToTimestamp", () => {
		it("should return holdings for all accounts up to timestamp", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId2, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "SOL", amount: 100.0, eurInvested: 10000, timestamp: now } as AssetHoldingEntity,
			]);

			const result = await repository.getAllHoldingsUpToTimestamp(userId, yesterday);

			expect(result.size).toBe(2);
			expect(result.get(accountId1)?.has("BTC")).toBe(true);
			expect(result.get(accountId2)?.has("ETH")).toBe(true);
			expect(result.get(accountId1)?.has("SOL")).toBe(false);
		});
	});

	describe("save and saveMany", () => {
		it("should save a single holding", async () => {
			const now = DateTime.utc();

			await repository.save({
				userId,
				providerAccountId: accountId1,
				asset: "BTC",
				amount: 1.0,
				eurInvested: 50000,
				timestamp: now,
			});

			const result = await repository.findLatestByAccount(userId, accountId1);
			expect(result.size).toBe(1);
			expect(result.get("BTC")?.amount).toBe(1.0);
		});

		it("should save multiple holdings", async () => {
			const now = DateTime.utc();

			await repository.saveMany([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now },
				{ userId, providerAccountId: accountId1, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now },
			]);

			const result = await repository.findLatestByAccount(userId, accountId1);
			expect(result.size).toBe(2);
		});

		it("should handle empty array in saveMany", async () => {
			await repository.saveMany([]);
			const result = await repository.findLatestByAccount(userId, accountId1);
			expect(result.size).toBe(0);
		});
	});

	describe("deleteByAccount", () => {
		it("should delete all holdings for an account", async () => {
			const now = DateTime.utc();

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId2, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: now } as AssetHoldingEntity,
			]);

			await repository.deleteByAccount(userId, accountId1);

			const result1 = await repository.findLatestByAccount(userId, accountId1);
			const result2 = await repository.findLatestByAccount(userId, accountId2);

			expect(result1.size).toBe(0);
			expect(result2.size).toBe(1);
		});
	});

	describe("deleteByAccountFromTimestamp", () => {
		it("should delete holdings from timestamp onwards", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });
			const twoDaysAgo = now.minus({ days: 2 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: twoDaysAgo } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 2.0, eurInvested: 100000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 3.0, eurInvested: 150000, timestamp: now } as AssetHoldingEntity,
			]);

			await repository.deleteByAccountFromTimestamp(userId, accountId1, yesterday);

			const result = await dataSource.getRepository(AssetHoldingEntity).find({
				where: { userId, providerAccountId: accountId1 },
			});

			expect(result.length).toBe(1);
			expect(Number(result[0].amount)).toBe(1.0);
		});
	});

	describe("findDistinctTimestamps", () => {
		it("should return distinct timestamps sorted ascending", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });
			const twoDaysAgo = now.minus({ days: 2 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: yesterday } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "SOL", amount: 100.0, eurInvested: 10000, timestamp: twoDaysAgo } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId1, asset: "XRP", amount: 1000.0, eurInvested: 500, timestamp: yesterday } as AssetHoldingEntity,
			]);

			const result = await repository.findDistinctTimestamps(userId, accountId1);

			expect(result.length).toBe(3);
			expect(result[0].toMillis()).toBe(twoDaysAgo.toMillis());
			expect(result[1].toMillis()).toBe(yesterday.toMillis());
			expect(result[2].toMillis()).toBe(now.toMillis());
		});

		it("should return distinct timestamps for all accounts when providerAccountId not specified", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetHoldingEntity).save([
				{ userId, providerAccountId: accountId1, asset: "BTC", amount: 1.0, eurInvested: 50000, timestamp: now } as AssetHoldingEntity,
				{ userId, providerAccountId: accountId2, asset: "ETH", amount: 10.0, eurInvested: 30000, timestamp: yesterday } as AssetHoldingEntity,
			]);

			const result = await repository.findDistinctTimestamps(userId);

			expect(result.length).toBe(2);
		});
	});
});
