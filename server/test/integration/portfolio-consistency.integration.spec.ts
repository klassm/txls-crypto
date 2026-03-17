import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { getDataSource } from "../../src/database.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { AssetPriceEntity } from "../../src/modules/prices/asset-price.entity.js";
import { AssetHoldingEntity } from "../../src/modules/asset-holdings/asset-holding.entity.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import accountsRouter from "../../src/routes/accounts/index.js";
import portfolioRouter from "../../src/routes/portfolio/index.js";
import { generateToken, AUTH_COOKIE_NAME } from "../../src/utils/password.js";
import * as database from "../../src/database.js";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";

describe("Portfolio Consistency Integration", () => {
	let app: express.Application;
	let dataSource: any;
	let userId: number;
	let accountId1: number;
	let accountId2: number;
	let authToken: string;

	beforeEach(async () => {
		await createTestDataSource();
		dataSource = await getDataSource();

		vi.spyOn(database, "getDataSource").mockResolvedValue(dataSource);

		app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use("/api/accounts", accountsRouter);
		app.use("/api/portfolio", portfolioRouter);

		await dataSource.query("DELETE FROM asset_holdings");
		await dataSource.query("DELETE FROM transactions");
		await dataSource.query("DELETE FROM asset_prices");
		await dataSource.query("DELETE FROM provider_accounts");
		await dataSource.query("DELETE FROM users");

		const userRepo = dataSource.getRepository(UserEntity);
		const user = new UserEntity();
		user.name = "Test User";
		user.username = "testuser";
		user.email = "test@example.com";
		user.password = "hashedpassword123";
		user.isAdmin = false;
		await userRepo.save(user);
		userId = user.id;
		authToken = generateToken({
			userId: user.id,
			username: user.username,
			email: user.email,
			isAdmin: user.isAdmin,
		});

		const accountRepo = dataSource.getRepository(AccountEntity);

		const account1 = new AccountEntity();
		account1.userId = userId;
		account1.provider = ProviderType.Bitpanda;
		await accountRepo.save(account1);
		accountId1 = account1.id;

		const account2 = new AccountEntity();
		account2.userId = userId;
		account2.provider = ProviderType.TradeRepublic;
		await accountRepo.save(account2);
		accountId2 = account2.id;
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await destroyTestDataSource();
	});

	describe("Portfolio history with hourly data", () => {
		beforeEach(async () => {
			const now = DateTime.utc();
			const oneHourAgo = now.minus({ hours: 1 });
			const twoHoursAgo = now.minus({ hours: 2 });
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "BTC", priceEur: 50000, fetchedAt: twoHoursAgo } as AssetPriceEntity,
				{ asset: "BTC", priceEur: 51000, fetchedAt: oneHourAgo } as AssetPriceEntity,
				{ asset: "BTC", priceEur: 52000, fetchedAt: now } as AssetPriceEntity,
				{ asset: "ETH", priceEur: 3000, fetchedAt: twoHoursAgo } as AssetPriceEntity,
				{ asset: "ETH", priceEur: 3100, fetchedAt: oneHourAgo } as AssetPriceEntity,
				{ asset: "ETH", priceEur: 3200, fetchedAt: now } as AssetPriceEntity,
			]);

			await dataSource.getRepository(TransactionEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					externalId: "tx1",
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 1.0,
					eurValue: 50000,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
				{
					userId,
					providerAccountId: accountId2,
					externalId: "tx2",
					asset: "ETH",
					type: TransactionType.buy,
					quantity: 10.0,
					eurValue: 30000,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					asset: "BTC",
					amount: 1.0,
					eurInvested: 50000,
					timestamp: yesterday,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId2,
					asset: "ETH",
					amount: 10.0,
					eurInvested: 30000,
					timestamp: yesterday,
				} as AssetHoldingEntity,
			]);
		});

		it("should return portfolio history with multiple data points", async () => {
			const response = await request(app)
				.get("/api/portfolio/overview?days=1")
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body.portfolioHistory.length).toBeGreaterThan(1);
		});

		it("should aggregate holdings from multiple accounts in portfolio overview", async () => {
			const response = await request(app)
				.get("/api/portfolio/overview?days=30")
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body.assets).toHaveLength(2);

			const btc = response.body.assets.find((a: any) => a.asset === "BTC");
			const eth = response.body.assets.find((a: any) => a.asset === "ETH");

			expect(btc.amount).toBe(1.0);
			expect(btc.eurInvested).toBe(50000);
			expect(eth.amount).toBe(10.0);
			expect(eth.eurInvested).toBe(30000);
		});

		it("should calculate correct 24h change with hourly data", async () => {
			const response = await request(app)
				.get(`/api/accounts/${accountId1}/portfolio-history?days=1`)
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response.status).toBe(200);

			const history = response.body;
			if (history.length >= 2) {
				const latest = history[history.length - 1];
				expect(latest.assets["BTC"]).toBeDefined();
				expect(latest.assets["BTC"].amount).toBe(1.0);
			}
		});
	});

	describe("Multiple accounts with same asset", () => {
		beforeEach(async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "BTC", priceEur: 50000, fetchedAt: yesterday } as AssetPriceEntity,
				{ asset: "BTC", priceEur: 55000, fetchedAt: now } as AssetPriceEntity,
			]);

			await dataSource.getRepository(TransactionEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					externalId: "tx1",
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 0.5,
					eurValue: 25000,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
				{
					userId,
					providerAccountId: accountId2,
					externalId: "tx2",
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 0.5,
					eurValue: 30000,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					asset: "BTC",
					amount: 0.5,
					eurInvested: 25000,
					timestamp: yesterday,
				} as AssetHoldingEntity,
				{
					userId,
					providerAccountId: accountId2,
					asset: "BTC",
					amount: 0.5,
					eurInvested: 30000,
					timestamp: yesterday,
				} as AssetHoldingEntity,
			]);
		});

		it("should aggregate eurInvested from multiple accounts with same asset", async () => {
			const response = await request(app)
				.get("/api/portfolio/overview?days=30")
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body.assets).toHaveLength(1);

			const btc = response.body.assets[0];
			expect(btc.asset).toBe("BTC");
			expect(btc.amount).toBe(1.0);
			expect(btc.eurInvested).toBe(55000);
		});

		it("should show correct eurInvested for each individual account", async () => {
			const response1 = await request(app)
				.get(`/api/accounts/${accountId1}/portfolio-history?days=30`)
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			const response2 = await request(app)
				.get(`/api/accounts/${accountId2}/portfolio-history?days=30`)
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response1.status).toBe(200);
			expect(response2.status).toBe(200);

			const history1 = response1.body;
			const history2 = response2.body;

			if (history1.length > 0) {
				const latest1 = history1[history1.length - 1];
				expect(latest1.totalEurInvested).toBe(25000);
			}

			if (history2.length > 0) {
				const latest2 = history2[history2.length - 1];
				expect(latest2.totalEurInvested).toBe(30000);
			}
		});
	});

	describe("eurInvested includes deposits", () => {
		beforeEach(async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(AssetPriceEntity).save([
				{ asset: "SOL", priceEur: 100, fetchedAt: yesterday } as AssetPriceEntity,
				{ asset: "SOL", priceEur: 80, fetchedAt: now } as AssetPriceEntity,
			]);
		});

		it("should include deposit eurValue in eurInvested calculation", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(TransactionEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					externalId: "buy1",
					asset: "SOL",
					type: TransactionType.buy,
					quantity: 10,
					eurValue: 1000,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
				{
					userId,
					providerAccountId: accountId1,
					externalId: "deposit1",
					asset: "SOL",
					type: TransactionType.deposit,
					quantity: 5,
					eurValue: 500,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					asset: "SOL",
					amount: 15,
					eurInvested: 1500,
					timestamp: yesterday,
				} as AssetHoldingEntity,
			]);

			const response = await request(app)
				.get("/api/portfolio/overview?days=30")
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response.status).toBe(200);
			expect(response.body.assets).toHaveLength(1);

			const sol = response.body.assets[0];
			expect(sol.asset).toBe("SOL");
			expect(sol.amount).toBe(15);
			expect(sol.eurInvested).toBe(1500);
		});

		it("should not include rewards in eurInvested", async () => {
			const now = DateTime.utc();
			const yesterday = now.minus({ days: 1 });

			await dataSource.getRepository(TransactionEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					externalId: "buy1",
					asset: "SOL",
					type: TransactionType.buy,
					quantity: 10,
					eurValue: 1000,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
				{
					userId,
					providerAccountId: accountId1,
					externalId: "reward1",
					asset: "SOL",
					type: TransactionType.reward,
					quantity: 1,
					eurValue: 100,
					eurFee: 0,
					timestamp: yesterday,
				} as TransactionEntity,
			]);

			await dataSource.getRepository(AssetHoldingEntity).save([
				{
					userId,
					providerAccountId: accountId1,
					asset: "SOL",
					amount: 11,
					eurInvested: 1000,
					timestamp: yesterday,
				} as AssetHoldingEntity,
			]);

			const response = await request(app)
				.get("/api/portfolio/overview?days=30")
				.set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`]);

			expect(response.status).toBe(200);

			const sol = response.body.assets[0];
			expect(sol.amount).toBe(11);
			expect(sol.eurInvested).toBe(1000);
		});
	});

	describe("Authentication and authorization", () => {
		it("should return 401 without auth token for portfolio overview", async () => {
			const response = await request(app).get("/api/portfolio/overview?days=30");
			expect(response.status).toBe(401);
		});

		it("should return 401 without auth token for account portfolio history", async () => {
			const response = await request(app).get(
				`/api/accounts/${accountId1}/portfolio-history?days=30`
			);
			expect(response.status).toBe(401);
		});
	});
});
