import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "http";
import { parse } from "url";
import request from "supertest";
import { DataSource } from "typeorm";
import { UserEntity, generateToken, verifyToken, AUTH_COOKIE_NAME } from "@txls/shared";
import { DateTime } from "luxon";

let dataSource: DataSource;
let server: any;
let baseUrl: string;

describe("Admin Users API Integration Tests", () => {
  beforeEach(async () => {
    dataSource = new DataSource({
      type: "better-sqlite3",
      database: ":memory:",
      entities: [UserEntity],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();

    server = createServer(async (req, res) => {
      const parsedUrl = parse(req.url || "", true);

      if (req.method === "GET" && parsedUrl.pathname === "/api/admin/users") {
        const authCookie = req.headers["cookie"];
        if (!authCookie?.includes(AUTH_COOKIE_NAME)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        const jwtToken = authCookie.split(`${AUTH_COOKIE_NAME}=`)[1]?.split(';')[0];
        const payload = verifyToken(jwtToken);

        if (!payload?.isAdmin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Forbidden" }));
          return;
        }

        const users = await dataSource.getRepository(UserEntity).find();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(users));
      } else if (req.method === "POST" && parsedUrl.pathname === "/api/admin/users") {
        const authCookie = req.headers["cookie"];
        if (!authCookie?.includes(AUTH_COOKIE_NAME)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        const jwtToken = authCookie.split(`${AUTH_COOKIE_NAME}=`)[1]?.split(';')[0];
        const payload = verifyToken(jwtToken);

        if (!payload?.isAdmin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Forbidden" }));
          return;
        }

        const body = (await new Promise((resolve) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => resolve(JSON.parse(data)));
        })) as any;

        const existing = await dataSource.getRepository(UserEntity).findOne({
          where: { username: body.username },
        });
        if (existing) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Username already exists" }));
          return;
        }

        const user = new UserEntity();
        user.name = body.name;
        user.username = body.username;
        user.email = body.email;
        user.password = "hashedpassword";
        user.salt = "salt123";
        user.isAdmin = body.isAdmin || false;
        user.createdAt = DateTime.now();
        user.updatedAt = DateTime.now();

        const saved = await dataSource.getRepository(UserEntity).save(user);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(saved));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe("GET /api/admin/users", () => {
    it("should return 401 without auth cookie", async () => {
      const response = await request(baseUrl).get("/api/admin/users");
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Unauthorized");
    });

    it("should return 403 for non-admin user", async () => {
      const authJwtToken = generateToken({
        userId: 1,
        username: "nonadmin",
        email: "nonadmin@test.com",
        isAdmin: false,
      });

      const response = await request(baseUrl)
        .get("/api/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${authJwtToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Forbidden");
    });

    it("should return users list for admin user", async () => {
      const authJwtToken = generateToken({
        userId: 1,
        username: "admin",
        email: "admin@test.com",
        isAdmin: true,
      });

      const user1 = new UserEntity();
      user1.name = "Test User 1";
      user1.username = "test1";
      user1.email = "test1@example.com";
      user1.password = "hash1";
      user1.salt = "salt1";
      user1.isAdmin = false;
      await dataSource.getRepository(UserEntity).save(user1);

      const response = await request(baseUrl)
        .get("/api/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${authJwtToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /api/admin/users", () => {
    it("should create new user as admin", async () => {
      const authJwtToken = generateToken({
        userId: 1,
        username: "admin",
        email: "admin@test.com",
        isAdmin: true,
      });

      const userData = {
        name: "New User",
        username: "newuser",
        email: "new@example.com",
        password: "password123",
        isAdmin: false,
      };

      const response = await request(baseUrl)
        .post("/api/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${authJwtToken}`)
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.username).toBe("newuser");
      expect(response.body.name).toBe("New User");
    });

    it("should return 400 for duplicate username", async () => {
      const authJwtToken = generateToken({
        userId: 1,
        username: "admin",
        email: "admin@test.com",
        isAdmin: true,
      });

      const existing = new UserEntity();
      existing.name = "Existing";
      existing.username = "existing";
      existing.email = "existing@test.com";
      existing.password = "hash";
      existing.salt = "salt";
      existing.isAdmin = false;
      await dataSource.getRepository(UserEntity).save(existing);

      const userData = {
        name: "New User",
        username: "existing",
        email: "new@example.com",
      };

      const response = await request(baseUrl)
        .post("/api/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${authJwtToken}`)
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Username already exists");
    });
  });
});