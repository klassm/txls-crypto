import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import { generateToken, AUTH_COOKIE_NAME } from "../../src/utils/password.js";
import { DateTime } from "luxon";
import { createTestDataSource, destroyTestDataSource } from "../test-helpers.js";
import { createContainer, resetContainer } from "../../src/di/container.js";
import configRouter from "../../src/routes/config/index.js";

let app: express.Application;
let mockFetch: any;

describe("HASS Auth API Integration Tests", () => {
  beforeEach(async () => {
    process.env.SUPERVISOR_TOKEN = "test-supervisor-token";
    process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-must-be-long-enough";
    await createTestDataSource();
    const dataSource = await getDataSource();
    createContainer(dataSource);

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/config", configRouter);
  });

  afterEach(async () => {
    resetContainer();
    await destroyTestDataSource();
    delete process.env.SUPERVISOR_TOKEN;
    delete process.env.JWT_SECRET;
    vi.restoreAllMocks();
  });

  describe("GET /api/config with HASS ingress", () => {
    it("should return user from valid HASS token", async () => {
      const mockUserEntity = { id: 1, username: "hassuser", name: "hassuser", email: "hassuser@hass.local", password: "hash", salt: "", isAdmin: false };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { user: { name: "hassuser", is_owner: false } },
        }),
      });

      const dataSource = await getDataSource();
      await dataSource.getRepository(UserEntity).save(mockUserEntity);

      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer valid-hass-token");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("hassuser");
      expect(response.body.user.isAdmin).toBe(false);
      expect(response.body.hassIngress).toBe(true);
    });

    it("should create admin user for HASS owner", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { user: { name: "hassowner", is_owner: true } },
        }),
      });

      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer valid-hass-token");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("hassowner");
      expect(response.body.user.isAdmin).toBe(true);
    });

    it("should return existing user on second request", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { user: { name: "existinguser", is_owner: false } },
        }),
      });

      const response1 = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer valid-hass-token");

      expect(response1.status).toBe(200);
      const userId1 = response1.body.user.id;

      const response2 = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer valid-hass-token");

      expect(response2.status).toBe(200);
      expect(response2.body.user.id).toBe(userId1);
    });

    it("should return null user when no authorization token", async () => {
      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test");

      expect(response.status).toBe(200);
      expect(response.body.user).toBeNull();
      expect(response.body.hassIngress).toBe(true);
    });

    it("should return authError when supervisor is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer valid-hass-token");

      expect(response.status).toBe(200);
      expect(response.body.authError).toBe("home_assistant_unavailable");
      expect(response.body.user).toBeNull();
    });

    it("should return null user when supervisor auth fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer invalid-hass-token");

      expect(response.status).toBe(200);
      expect(response.body.user).toBeNull();
    });

    it("should prefer cookie over HASS token", async () => {
      const existingUser = new UserEntity();
      existingUser.name = "Cookie User";
      existingUser.username = "cookieuser";
      existingUser.email = "cookie@example.com";
      existingUser.password = "hash";
      existingUser.salt = "";
      existingUser.isAdmin = true;
      existingUser.createdAt = DateTime.now();
      existingUser.updatedAt = DateTime.now();
      const dataSource = await getDataSource();
      await dataSource.getRepository(UserEntity).save(existingUser);

      const authJwtToken = generateToken({
        userId: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        isAdmin: existingUser.isAdmin,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { user: { name: "hassuser", is_owner: false } },
        }),
      });

      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer hass-token")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${authJwtToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe("cookieuser");
      // HASS token validation should not be called when cookie is present
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should create new user as non-admin for HASS non-owner", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { user: { name: "regularuser", is_owner: false } },
        }),
      });

      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("Authorization", "Bearer valid-hass-token");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("regularuser");
      expect(response.body.user.isAdmin).toBe(false);
    });

    it("should create user from X-Remote-User-Id header", async () => {
      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("X-Remote-User-Id", "hassuser456");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("hassuser456");
      expect(response.body.user.isAdmin).toBe(false);
    });

    it("should create user from X-Remote-User-Name header", async () => {
      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("X-Remote-User-Name", "remoteuser789");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("remoteuser789");
      expect(response.body.user.isAdmin).toBe(false);
    });

    it("should create user from X-Remote-User-Display-Name header", async () => {
      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("X-Remote-User-Display-Name", "Display Name User");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("Display Name User");
      expect(response.body.user.isAdmin).toBe(false);
    });

    it("should prefer X-Remote-User-Name over X-Remote-User-Id", async () => {
      const response = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("X-Remote-User-Id", "hassuser")
        .set("X-Remote-User-Name", "preferreduser");

      expect(response.status).toBe(200);
      expect(response.body.user).not.toBeNull();
      expect(response.body.user.username).toBe("preferreduser");
    });

    it("should return existing user when same HASS header used twice", async () => {
      const response1 = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("X-Remote-User-Id", "existinghassuser");

      expect(response1.status).toBe(200);
      const userId1 = response1.body.user.id;

      const response2 = await request(app)
        .get("/api/config")
        .set("X-Ingress-Path", "/api/hassio_ingress/test")
        .set("X-Remote-User-Id", "existinghassuser");

      expect(response2.status).toBe(200);
      expect(response2.body.user.id).toBe(userId1);
    });
  });
});
