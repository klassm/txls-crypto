import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { getDataSource } from "../../src/database.js";
import { AccountEntity } from "../../src/modules/accounts/account.entity.js";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import taxRouter from "../../src/routes/tax/index.js";
import { generateToken, AUTH_COOKIE_NAME } from "../../src/utils/password.js";
import { DateTime } from "luxon";
import { ProviderType } from "@txls/shared";
import * as database from "../../src/database.js";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";

describe("Tax API Integration Tests", () => {
  let app: express.Application;

  beforeEach(async () => {
    await createTestDataSource();
    const dataSource = await getDataSource();

    vi.spyOn(database, "getDataSource").mockResolvedValue(dataSource);

    app = express();
    app.use(cookieParser());
    app.use("/api/tax", taxRouter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await destroyTestDataSource();
  });

  const createTestUser = async (userId: number): Promise<string> => {
    const authJwtToken = generateToken({
      userId,
      username: "testuser",
      email: "test@example.com",
      isAdmin: false,
    });
    return authJwtToken;
  };

  const createTestAccount = async (userId: number): Promise<AccountEntity> => {
    const account = new AccountEntity();
    account.userId = userId;
    account.provider = ProviderType.Bitpanda;
    account.createdAt = DateTime.now();
    account.updatedAt = DateTime.now();
    return (await getDataSource()).getRepository(AccountEntity).save(account);
  };

  const createTestTransaction = async (
    userId: number,
    providerAccountId: number,
    timestamp: DateTime,
  ): Promise<TransactionEntity> => {
    const tx = new TransactionEntity();
    tx.userId = userId;
    tx.providerAccountId = providerAccountId;
    tx.externalId = `test-${Date.now()}-${Math.random()}`;
    tx.timestamp = timestamp;
    tx.type = "buy";
    tx.asset = "BTC";
    tx.quantity = 1;
    tx.eurValue = 1000;
    tx.eurFee = 0;
    tx.processed = false;
    return (await getDataSource()).getRepository(TransactionEntity).save(tx);
  };

  describe("GET /api/tax/years", () => {
    it("should return 401 without auth cookie", async () => {
      const response = await request(app).get("/api/tax/years");
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Unauthorized");
    });

    it("should return current year when no transactions exist", async () => {
      const token = await createTestUser(1);

      const response = await request(app)
        .get("/api/tax/years")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);

      expect(response.status).toBe(200);
      expect(response.body.years).toBeDefined();
      expect(Array.isArray(response.body.years)).toBe(true);
      expect(response.body.years).toContain(DateTime.now().year);
    });

    it("should return years from all accounts transactions", async () => {
      const userId = 1;
      const token = await createTestUser(userId);

      const account = await createTestAccount(userId);

      await createTestTransaction(userId, account.id, DateTime.fromISO("2022-06-15T10:00:00Z"));
      await createTestTransaction(userId, account.id, DateTime.fromISO("2023-03-20T10:00:00Z"));
      await createTestTransaction(userId, account.id, DateTime.fromISO("2024-01-10T10:00:00Z"));

      const response = await request(app)
        .get("/api/tax/years")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);

      expect(response.status).toBe(200);
      expect(response.body.years).toContain(2022);
      expect(response.body.years).toContain(2023);
      expect(response.body.years).toContain(2024);
      expect(response.body.years).toContain(DateTime.now().year);
    });

    it("should return years sorted in descending order", async () => {
      const userId = 1;
      const token = await createTestUser(userId);

      const account = await createTestAccount(userId);

      await createTestTransaction(userId, account.id, DateTime.fromISO("2021-06-15T10:00:00Z"));
      await createTestTransaction(userId, account.id, DateTime.fromISO("2024-03-20T10:00:00Z"));

      const response = await request(app)
        .get("/api/tax/years")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);

      expect(response.status).toBe(200);
      const years = response.body.years as number[];
      for (let i = 0; i < years.length - 1; i++) {
        expect(years[i]).toBeGreaterThanOrEqual(years[i + 1]);
      }
    });

    it("should only return years for the authenticated user", async () => {
      const userId1 = 1;
      const userId2 = 2;
      const token1 = generateToken({
        userId: userId1,
        username: "user1",
        email: "user1@example.com",
        isAdmin: false,
      });

      const account1 = await createTestAccount(userId1);
      const account2 = new AccountEntity();
      account2.userId = userId2;
      account2.provider = ProviderType.Bitpanda;
      account2.createdAt = DateTime.now();
      account2.updatedAt = DateTime.now();
      const savedAccount2 = await (await getDataSource()).getRepository(AccountEntity).save(account2);

      await createTestTransaction(userId1, account1.id, DateTime.fromISO("2022-06-15T10:00:00Z"));
      await createTestTransaction(userId2, savedAccount2.id, DateTime.fromISO("2020-03-20T10:00:00Z"));

      const response = await request(app)
        .get("/api/tax/years")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.years).toContain(2022);
      expect(response.body.years).not.toContain(2020);
    });
  });
});
