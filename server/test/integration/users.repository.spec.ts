import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { getDataSource, resetDataSource } from "../../src/database.js";
import { UsersRepository } from "../../src/modules/users/users.repository.js";
import { UserEntity } from "../../src/modules/users/user.entity.js";
import type { DataSource } from "typeorm";

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

describe.each(testConfigs)("$displayName UsersRepository Integration", ({ name, displayName, setup, teardown }) => {
  let dataSource: DataSource;
  let repository: UsersRepository;
  const originalDbConnectionString = process.env.DB_CONNECTION_STRING;

  beforeAll(async () => {
    resetDataSource();
    await setup();
    dataSource = await getDataSource();
    repository = new UsersRepository(dataSource);
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
      await dataSource.query("DELETE FROM users");
    }
  });

  describe("count", () => {
    it("should return 0 when database is empty", async () => {
      const count = await repository.count();
      expect(count).toBe(0);
    });

    it("should return correct user count", async () => {
      const user1 = new UserEntity();
      user1.name = "Test User 1";
      user1.username = `test1-${Date.now()}`;
      user1.email = `test1-${Date.now()}@example.com`;
      user1.password = "hashed1";
      user1.salt = "salt1";
      user1.isAdmin = false;
      await repository.save(user1);

      const count = await repository.count();
      expect(count).toBe(1);
    });
  });

  describe("findAll", () => {
    it("should return empty array when no users exist", async () => {
      const users = await repository.findAll();
      expect(users).toEqual([]);
    });

    it("should return all users", async () => {
      const user1 = new UserEntity();
      user1.name = "Test User 1";
      user1.username = `test1-${Date.now()}`;
      user1.email = `test1-${Date.now()}@example.com`;
      user1.password = "hashed1";
      user1.salt = "salt1";
      user1.isAdmin = false;
      await repository.save(user1);

      const user2 = new UserEntity();
      user2.name = "Test User 2";
      user2.username = `test2-${Date.now()}`;
      user2.email = `test2-${Date.now()}@example.com`;
      user2.password = "hashed2";
      user2.salt = "salt2";
      user2.isAdmin = true;
      await repository.save(user2);

      const users = await repository.findAll();
      expect(users).toHaveLength(2);
    });
  });

  describe("findById", () => {
    it("should return null when user not found", async () => {
      const user = await repository.findById(99999);
      expect(user).toBeNull();
    });

    it("should return user by id", async () => {
      const user = new UserEntity();
      user.name = "Test User";
      user.username = `testuser-${Date.now()}`;
      user.email = `test-${Date.now()}@example.com`;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      const saved = await repository.save(user);

      const found = await repository.findById(saved.id);
      expect(found).not.toBeNull();
      expect(found?.username).toBe(user.username);
    });
  });

  describe("findByUsername", () => {
    it("should return null when username not found", async () => {
      const user = await repository.findByUsername("nonexistent");
      expect(user).toBeNull();
    });

    it("should return user by username", async () => {
      const username = `testuser-${Date.now()}`;
      const user = new UserEntity();
      user.name = "Test User";
      user.username = username;
      user.email = `test-${Date.now()}@example.com`;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      await repository.save(user);

      const found = await repository.findByUsername(username);
      expect(found).not.toBeNull();
      expect(found?.username).toBe(username);
    });
  });

  describe("existsByUsername", () => {
    it("should return false when username does not exist", async () => {
      const exists = await repository.existsByUsername("nonexistent");
      expect(exists).toBe(false);
    });

    it("should return true when username exists", async () => {
      const username = `testuser-${Date.now()}`;
      const user = new UserEntity();
      user.name = "Test User";
      user.username = username;
      user.email = `test-${Date.now()}@example.com`;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      await repository.save(user);

      const exists = await repository.existsByUsername(username);
      expect(exists).toBe(true);
    });
  });

  describe("existsByEmail", () => {
    it("should return false when email does not exist", async () => {
      const exists = await repository.existsByEmail("nonexistent@example.com");
      expect(exists).toBe(false);
    });

    it("should return true when email exists", async () => {
      const email = `test-${Date.now()}@example.com`;
      const user = new UserEntity();
      user.name = "Test User";
      user.username = `testuser-${Date.now()}`;
      user.email = email;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      await repository.save(user);

      const exists = await repository.existsByEmail(email);
      expect(exists).toBe(true);
    });
  });

  describe("save", () => {
    it("should save new user", async () => {
      const user = new UserEntity();
      user.name = "Test User";
      user.username = `testuser-${Date.now()}`;
      user.email = `test-${Date.now()}@example.com`;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      const saved = await repository.save(user);

      expect(saved.id).toBeDefined();
      expect(saved.username).toBe(user.username);
    });

    it("should update existing user", async () => {
      const user = new UserEntity();
      user.name = "Test User";
      user.username = `testuser-${Date.now()}`;
      user.email = `test-${Date.now()}@example.com`;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      const saved = await repository.save(user);

      saved.name = "Updated Name";
      saved.updatedAt = DateTime.now();
      const updated = await repository.save(saved);

      expect(updated.name).toBe("Updated Name");
    });
  });

  describe("delete", () => {
    it("should delete user by id", async () => {
      const user = new UserEntity();
      user.name = "Test User";
      user.username = `testuser-${Date.now()}`;
      user.email = `test-${Date.now()}@example.com`;
      user.password = "hashed";
      user.salt = "salt";
      user.isAdmin = false;
      const saved = await repository.save(user);

      await repository.delete(saved.id);

      const found = await repository.findById(saved.id);
      expect(found).toBeNull();
    });
  });
});
