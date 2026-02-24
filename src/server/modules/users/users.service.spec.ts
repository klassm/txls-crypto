import { describe, it, expect, beforeEach, vi } from "vitest";
import { UsersService } from "@/server/modules/users/users.service";
import { UserEntity } from "@/server/modules/users/user.entity";
import { DateTime } from "luxon";
import bcrypt from "bcrypt";

describe("UsersService", () => {
  let service: UsersService;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      count: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      findByUsername: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      existsByUsername: vi.fn(),
      existsByEmail: vi.fn(),
    };

    service = new UsersService(mockRepository);
  });

  describe("createOnboardingUser", () => {
    beforeEach(() => {
      mockRepository.findAll.mockResolvedValue([]);
    });

    it("should create first user with admin privileges", async () => {
      mockRepository.existsByUsername.mockResolvedValue(false);
      mockRepository.existsByEmail.mockResolvedValue(false);
      
      const savedUser = new UserEntity();
      savedUser.id = 1;
      savedUser.name = "Test User";
      savedUser.username = "testuser";
      savedUser.email = "test@example.com";
      savedUser.isAdmin = true;
      savedUser.createdAt = DateTime.now();
      savedUser.updatedAt = DateTime.now();
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await service.createOnboardingUser({
        name: "Test User",
        username: "testuser",
        password: "password123",
        email: "test@example.com",
      });

      expect(result.isAdmin).toBe(true);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockRepository.save.mock.calls[0][0].password).toMatch(/^\$2b\$12\$/);
      expect(mockRepository.save.mock.calls[0][0].salt).toBe("");
    });

    it("should throw error if username exists", async () => {
      mockRepository.existsByUsername.mockResolvedValue(true);

      await expect(
        service.createOnboardingUser({
          name: "Test User",
          username: "testuser",
          password: "password123",
          email: "test@example.com",
        })
      ).rejects.toThrow("Username already exists");
    });

    it("should throw error if email exists", async () => {
      mockRepository.existsByUsername.mockResolvedValue(false);
      mockRepository.existsByEmail.mockResolvedValue(true);

      await expect(
        service.createOnboardingUser({
          name: "Test User",
          username: "testuser",
          password: "password123",
          email: "test@example.com",
        })
      ).rejects.toThrow("Email already exists");
    });
  });

  describe("verifyPassword", () => {
    it("should return user with correct password", async () => {
      const user = new UserEntity();
      user.id = 1;
      user.name = "Test User";
      user.username = "testuser";
      user.email = "test@example.com";
      user.salt = "";
      user.password = await bcrypt.hash("password123", 12);
      user.isAdmin = false;
      user.createdAt = DateTime.now();
      user.updatedAt = DateTime.now();

      mockRepository.findByUsername.mockResolvedValue(user);

      const result = await service.verifyPassword("testuser", "password123");

      expect(result).not.toBeNull();
      expect(result?.username).toBe("testuser");
    });

    it("should return null with wrong password", async () => {
      const user = new UserEntity();
      user.id = 1;
      user.name = "Test User";
      user.username = "testuser";
      user.email = "test@example.com";
      user.salt = "";
      user.password = await bcrypt.hash("password123", 12);
      user.isAdmin = false;
      user.createdAt = DateTime.now();
      user.updatedAt = DateTime.now();

      mockRepository.findByUsername.mockResolvedValue(user);

      const result = await service.verifyPassword("testuser", "wrongpassword");

      expect(result).toBeNull();
    });

    it("should return null with non-existent user", async () => {
      mockRepository.findByUsername.mockResolvedValue(null);

      const result = await service.verifyPassword("nonexistent", "password");

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all users", async () => {
      const user1 = new UserEntity();
      user1.id = 1;
      user1.name = "User 1";
      user1.username = "user1";
      user1.email = "user1@example.com";
      user1.password = "hash1";
      user1.salt = "salt1";
      user1.isAdmin = true;
      user1.createdAt = DateTime.now();
      user1.updatedAt = DateTime.now();

      const user2 = new UserEntity();
      user2.id = 2;
      user2.name = "User 2";
      user2.username = "user2";
      user2.email = "user2@example.com";
      user2.password = "hash2";
      user2.salt = "salt2";
      user2.isAdmin = false;
      user2.createdAt = DateTime.now();
      user2.updatedAt = DateTime.now();

      mockRepository.findAll.mockResolvedValue([user1, user2]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].username).toBe("user1");
    });
  });

  describe("createUser", () => {
    it("should create new user", async () => {
      mockRepository.existsByUsername.mockResolvedValue(false);
      mockRepository.existsByEmail.mockResolvedValue(false);
      
      const savedUser = new UserEntity();
      savedUser.id = 1;
      savedUser.name = "New User";
      savedUser.username = "newuser";
      savedUser.email = "new@example.com";
      savedUser.isAdmin = false;
      savedUser.createdAt = DateTime.now();
      savedUser.updatedAt = DateTime.now();
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await service.createUser({
        name: "New User",
        username: "newuser",
        password: "password123",
        email: "new@example.com",
        isAdmin: false,
      });

      expect(result.username).toBe("newuser");
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it("should throw error if username exists", async () => {
      mockRepository.existsByUsername.mockResolvedValue(true);

      await expect(
        service.createUser({
          name: "Test User",
          username: "existinguser",
          password: "password123",
          email: "test@example.com",
        })
      ).rejects.toThrow("Username already exists");
    });

    it("should throw error if email exists", async () => {
      mockRepository.existsByUsername.mockResolvedValue(false);
      mockRepository.existsByEmail.mockResolvedValue(true);

      await expect(
        service.createUser({
          name: "Test User",
          username: "testuser",
          password: "password123",
          email: "existing@example.com",
        })
      ).rejects.toThrow("Email already exists");
    });
  });

  describe("updateUser", () => {
    beforeEach(() => {
      mockRepository.findAll.mockResolvedValue([]);
    });

    it("should update user details", async () => {
      const existingUser = new UserEntity();
      existingUser.id = 1;
      existingUser.name = "Old Name";
      existingUser.username = "testuser";
      existingUser.email = "old@example.com";
      existingUser.password = "hash";
      existingUser.salt = "salt";
      existingUser.isAdmin = false;
      existingUser.createdAt = DateTime.now();
      existingUser.updatedAt = DateTime.now();

      const updatedUser = new UserEntity();
      updatedUser.id = 1;
      updatedUser.name = "New Name";
      updatedUser.username = "testuser";
      updatedUser.email = "new@example.com";
      updatedUser.password = "hash";
      updatedUser.salt = "salt";
      updatedUser.isAdmin = true;
      updatedUser.createdAt = DateTime.now();
      updatedUser.updatedAt = DateTime.now();

      mockRepository.findById.mockResolvedValue(existingUser);
      mockRepository.save.mockResolvedValue(updatedUser);

      const result = await service.updateUser(1, {
        name: "New Name",
        email: "new@example.com",
        isAdmin: true,
      });

      expect(result.name).toBe("New Name");
      expect(result.email).toBe("new@example.com");
      expect(result.isAdmin).toBe(true);
    });

    it("should throw error if user not found", async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateUser(999, { name: "Test" })
      ).rejects.toThrow("User not found");
    });

    it("should not allow removing last admin", async () => {
      const existingUser = new UserEntity();
      existingUser.id = 1;
      existingUser.name = "Admin";
      existingUser.username = "admin";
      existingUser.email = "admin@example.com";
      existingUser.password = "hash";
      existingUser.salt = "salt";
      existingUser.isAdmin = true;
      existingUser.createdAt = DateTime.now();
      existingUser.updatedAt = DateTime.now();

      mockRepository.findById.mockResolvedValue(existingUser);
      mockRepository.count.mockResolvedValue(1);

      await expect(
        service.updateUser(1, { isAdmin: false })
      ).rejects.toThrow("Cannot remove admin privileges from the last admin user");
    });
  });

  describe("updatePassword", () => {
    beforeEach(() => {
      mockRepository.findAll.mockResolvedValue([]);
    });

    it("should update user password", async () => {
      const existingUser = new UserEntity();
      existingUser.id = 1;
      existingUser.name = "Test User";
      existingUser.username = "testuser";
      existingUser.email = "test@example.com";
      existingUser.password = "oldhash";
      existingUser.salt = "oldsalt";
      existingUser.isAdmin = false;
      existingUser.createdAt = DateTime.now();
      existingUser.updatedAt = DateTime.now();

      const updatedUser = new UserEntity();
      updatedUser.id = 1;
      updatedUser.name = "Test User";
      updatedUser.username = "testuser";
      updatedUser.email = "test@example.com";
      updatedUser.password = "newhash";
      updatedUser.salt = "newsalt";
      updatedUser.isAdmin = false;
      updatedUser.createdAt = DateTime.now();
      updatedUser.updatedAt = DateTime.now();

      mockRepository.findById.mockResolvedValue(existingUser);
      mockRepository.save.mockResolvedValue(updatedUser);

      await service.updatePassword(1, "newpassword123");

      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockRepository.save.mock.calls[0][0].salt).not.toBe("oldsalt");
      expect(mockRepository.save.mock.calls[0][0].password).not.toBe("oldhash");
    });

    it("should throw error if user not found", async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.updatePassword(999, "newpassword")
      ).rejects.toThrow("User not found");
    });
  });

  describe("deleteUser", () => {
    beforeEach(() => {
      mockRepository.findAll.mockResolvedValue([]);
    });

    it("should delete user", async () => {
      const user = new UserEntity();
      user.id = 1;
      user.name = "Test User";
      user.username = "testuser";
      user.email = "test@example.com";
      user.password = "hash";
      user.salt = "salt";
      user.isAdmin = false;
      user.createdAt = DateTime.now();
      user.updatedAt = DateTime.now();

      mockRepository.findById.mockResolvedValue(user);
      mockRepository.delete.mockResolvedValue(undefined);

      await service.deleteUser(1);

      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });

    it("should throw error if user not found", async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.deleteUser(999)).rejects.toThrow("User not found");
    });

it("should not allow deleting last admin", async () => {
      const adminUser = new UserEntity();
      adminUser.id = 1;
      adminUser.name = "Admin";
      adminUser.username = "admin";
      adminUser.email = "admin@example.com";
      adminUser.password = "hash";
      adminUser.salt = "salt";
      adminUser.isAdmin = true;
      adminUser.createdAt = DateTime.now();
      adminUser.updatedAt = DateTime.now();

      mockRepository.findById.mockResolvedValue(adminUser);
      mockRepository.count.mockResolvedValue(1);

      await expect(service.deleteUser(1)).rejects.toThrow(
        "Cannot delete the last admin user"
      );
    });
  });
});