import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { getDataSource } from "../../src/database.js";
import { TransactionsRepository } from "../../src/modules/transactions/transactions.repository.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { ProviderType, TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import accountsRouter from "../../src/routes/accounts/index.js";
import { generateToken, AUTH_COOKIE_NAME } from "../../src/utils/password.js";
import * as database from "../../src/database.js";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";
import { createContainer, resetContainer } from "../../src/di/container.js";

describe("Manual Staking API Integration", () => {
  let app: express.Application;
  let dataSource: any;
  let userId: number;
  let bitpandaAccountId: number;
  let traderepublicAccountId: number;
  let authToken: string;

  beforeEach(async () => {
    await createTestDataSource();
    dataSource = await getDataSource();
    createContainer(dataSource);

    vi.spyOn(database, "getDataSource").mockResolvedValue(dataSource);

    app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/accounts", accountsRouter);

    await dataSource.query("DELETE FROM transactions");
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
    
    const bitpandaAccount = new AccountEntity();
    bitpandaAccount.userId = userId;
    bitpandaAccount.provider = ProviderType.Bitpanda;
    await accountRepo.save(bitpandaAccount);
    bitpandaAccountId = bitpandaAccount.id;

    const traderepublicAccount = new AccountEntity();
    traderepublicAccount.userId = userId;
    traderepublicAccount.provider = ProviderType.TradeRepublic;
    await accountRepo.save(traderepublicAccount);
    traderepublicAccountId = traderepublicAccount.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetContainer();
    await destroyTestDataSource();
  });

  describe("POST /api/accounts/:id/transactions", () => {
    it("should add manual staking reward for Bitpanda account", async () => {
      const response = await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: 0.5,
          eurValue: 75.0,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.imported).toBe(1);
    });

    it("should add manual staking reward for TradeRepublic account", async () => {
      const response = await request(app)
        .post(`/api/accounts/${traderepublicAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-02-20T14:00:00",
          asset: "ETH",
          quantity: 0.1,
          eurValue: 300.0,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.imported).toBe(1);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should return 400 for negative quantity", async () => {
      const response = await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: -0.5,
          eurValue: 75.0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should return 400 for negative eurValue", async () => {
      const response = await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: 0.5,
          eurValue: -75.0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: 0.5,
          eurValue: 75.0,
        });

      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent account", async () => {
      const response = await request(app)
        .post("/api/accounts/99999/transactions")
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: 0.5,
          eurValue: 75.0,
        });

      expect(response.status).toBe(404);
    });

    it("should save transaction with correct type", async () => {
      await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: 0.5,
          eurValue: 75.0,
        });

      const transactionsRepo = new TransactionsRepository(dataSource);
      const transactions = await transactionsRepo.findByProviderAccountId(userId, bitpandaAccountId);

      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe(TransactionType.reward);
      expect(transactions[0].asset).toBe("SOL");
      expect(transactions[0].quantity).toBe(0.5);
      expect(transactions[0].eurValue).toBe(75.0);
    });

    it("should generate unique externalId", async () => {
      await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-15T10:00:00",
          asset: "SOL",
          quantity: 0.5,
          eurValue: 75.0,
        });

      await request(app)
        .post(`/api/accounts/${bitpandaAccountId}/transactions`)
        .set("Cookie", [`${AUTH_COOKIE_NAME}=${authToken}`])
        .send({
          timestamp: "2025-01-16T10:00:00",
          asset: "ETH",
          quantity: 0.1,
          eurValue: 300.0,
        });

      const transactionsRepo = new TransactionsRepository(dataSource);
      const transactions = await transactionsRepo.findByProviderAccountId(userId, bitpandaAccountId);

      expect(transactions).toHaveLength(2);
      expect(transactions[0].externalId).not.toBe(transactions[1].externalId);
    });
  });
});
