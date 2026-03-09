import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDataSource, resetDataSource } from "../../database.js";
import { UsersRepository } from "./users.repository.js";
import { UserEntity } from "./user.entity.js";
import { DateTime } from "luxon";

describe("UsersRepository", () => {
  let repository: UsersRepository;

  beforeEach(async () => {
    process.env.DB_CONNECTION_STRING = ":memory:";
    resetDataSource();
    const dataSource = await getDataSource();
    repository = new UsersRepository(dataSource);
  });

  afterEach(async () => {
    const ds = await getDataSource();
    if (ds?.isInitialized) {
      await ds.destroy();
    }
    resetDataSource();
    delete process.env.DB_CONNECTION_STRING;
  });

  describe("count", () => {
    it("should return 0 when database is empty", async () => {
      const count = await repository.count();
      expect(count).toBe(0);
    });

    it("should return correct user count", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const DateTime = (await import("luxon")).DateTime;
      const user1 = new UserEntity();
      user1.name = "Test User 1";
      user1.username = "test1";
      user1.email = "test1@example.com";
      user1.password = "hashed1";
      user1.salt = "salt1";
      user1.isAdmin = false;
      user1.createdAt = DateTime.now();
      user1.updatedAt = DateTime.now();
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
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      
      const user1 = new UserEntity();
      user1.name = "Test User 1";
      user1.username = "test1";
      user1.email = "test1@example.com";
      user1.password = "hashed1";
      user1.salt = "salt1";
      user1.isAdmin = false;
      await repository.save(user1);

      const user2 = new UserEntity();
      user2.name = "Test User 2";
      user2.username = "test2";
      user2.email = "test2@example.com";
      user2.password = "hashed2";
      user2.salt = "salt2";
      user2.isAdmin = true;
      await repository.save(user2);

      const users = await repository.findAll();
      expect(users).toHaveLength(2);
      const usernames = users.map(u => u.username).sort();
      expect(usernames).toEqual(["test1", "test2"]);
    });
  });

  describe("findById", () => {
    it("should return null when user not found", async () => {
      const user = await repository.findById(999);
      expect(user).toBeNull();
    });

    it("should return user by id", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "test1";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      const saved = await repository.save(user1);

      const found = await repository.findById(saved.id);
      expect(found).not.toBeNull();
      expect(found?.username).toBe("test1");
    });
  });

  describe("findByUsername", () => {
    it("should return null when username not found", async () => {
      const user = await repository.findByUsername("nonexistent");
      expect(user).toBeNull();
    });

    it("should return user by username", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "testuser";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      await repository.save(user1);

      const found = await repository.findByUsername("testuser");
      expect(found).not.toBeNull();
      expect(found?.username).toBe("testuser");
    });
  });

  describe("existsByUsername", () => {
    it("should return false when username does not exist", async () => {
      const exists = await repository.existsByUsername("nonexistent");
      expect(exists).toBe(false);
    });

    it("should return true when username exists", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "testuser";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      await repository.save(user1);

      const exists = await repository.existsByUsername("testuser");
      expect(exists).toBe(true);
    });
  });

  describe("existsByEmail", () => {
    it("should return false when email does not exist", async () => {
      const exists = await repository.existsByEmail("nonexistent@example.com");
      expect(exists).toBe(false);
    });

    it("should return true when email exists", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "testuser";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      await repository.save(user1);

      const exists = await repository.existsByEmail("test@example.com");
      expect(exists).toBe(true);
    });
  });

  describe("save", () => {
    it("should save new user", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "testuser";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      const saved = await repository.save(user1);

      expect(saved.id).toBeDefined();
      expect(saved.username).toBe("testuser");
    });

    it("should update existing user", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "testuser";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      const saved = await repository.save(user1);

      saved.name = "Updated Name";
      const updated = await repository.save(saved);

      expect(updated.name).toBe("Updated Name");
    });
  });

  describe("delete", () => {
    it("should delete user by id", async () => {
      const UserEntity = (await import("./user.entity.js")).UserEntity;
      const user1 = new UserEntity();
      user1.name = "Test User";
      user1.username = "testuser";
      user1.email = "test@example.com";
      user1.password = "hashed";
      user1.salt = "salt";
      user1.isAdmin = false;
      const saved = await repository.save(user1);

      await repository.delete(saved.id);

      const found = await repository.findById(saved.id);
      expect(found).toBeNull();
    });
  });
});