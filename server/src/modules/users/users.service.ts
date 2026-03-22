import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { User, CreateOnboardingUserDto } from "@txls/shared";
import { TYPES } from "../../di/types.js";
import { UserEntity } from "./user.entity.js";
import { UsersRepository } from "./users.repository.js";
import { logger } from "../../common/logger.js";
import bcrypt from "bcrypt";
import { SALT_ROUNDS } from "../../utils/password.js";

export interface CreateUserDto {
  name: string;
  username: string;
  password: string;
  email: string;
  isAdmin?: boolean;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  isAdmin?: boolean;
}

@injectable()
export class UsersService {
  private readonly repository: UsersRepository;

  constructor(@inject(TYPES.UsersRepository) repository: UsersRepository) {
    this.repository = repository;
  }

  async findAll(): Promise<User[]> {
    try {
      const entities = await this.repository.findAll();
      return entities.map((entity) => this.entityToSchema(entity));
    } catch (error) {
      logger.error({
        message: "Failed to find all users",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findById(id: number): Promise<User | null> {
    try {
      const entity = await this.repository.findById(id);
      if (!entity) return null;

      return this.entityToSchema(entity);
    } catch (error) {
      logger.error({
        message: "Failed to find user",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const entity = await this.repository.findByUsername(username);
      if (!entity) return null;

      return this.entityToSchema(entity);
    } catch (error) {
      logger.error({
        message: "Failed to find user by username",
        username,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async createOnboardingUser(data: CreateOnboardingUserDto): Promise<User> {
    const existingUsername = await this.repository.existsByUsername(data.username);
    if (existingUsername) {
      throw new Error("Username already exists");
    }

    const existingEmail = await this.repository.existsByEmail(data.email);
    if (existingEmail) {
      throw new Error("Email already exists");
    }

    try {
      const password = await bcrypt.hash(data.password, SALT_ROUNDS);

      const entity = new UserEntity();
      entity.name = data.name;
      entity.username = data.username;
      entity.password = password;
      entity.salt = "";
      entity.email = data.email;
      entity.isAdmin = true;

      const saved = await this.repository.save(entity);

      logger.info({
        message: "User created successfully",
        id: saved.id,
        username: saved.username,
      });

      return this.entityToSchema(saved);
    } catch (error) {
      logger.error({
        message: "Failed to create user",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const existingUsername = await this.repository.existsByUsername(data.username);
    if (existingUsername) {
      throw new Error("Username already exists");
    }

    const existingEmail = await this.repository.existsByEmail(data.email);
    if (existingEmail) {
      throw new Error("Email already exists");
    }

    try {
      const password = await bcrypt.hash(data.password, SALT_ROUNDS);

      const entity = new UserEntity();
      entity.name = data.name;
      entity.username = data.username;
      entity.password = password;
      entity.salt = "";
      entity.email = data.email;
      entity.isAdmin = data.isAdmin ?? false;

      const saved = await this.repository.save(entity);

      logger.info({
        message: "User created successfully",
        id: saved.id,
        username: saved.username,
      });

      return this.entityToSchema(saved);
    } catch (error) {
      logger.error({
        message: "Failed to create user",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateUser(id: number, data: UpdateUserDto): Promise<User> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new Error("User not found");
    }

    try {
      if (data.name !== undefined) {
        entity.name = data.name;
      }
      if (data.email !== undefined) {
        entity.email = data.email;
      }
      if (data.isAdmin !== undefined && data.isAdmin !== entity.isAdmin) {
        const users = await this.repository.findAll();
        const adminCount = users.filter((u) => u.isAdmin).length;

        if (data.isAdmin === false && adminCount <= 1 && entity.isAdmin) {
          throw new Error("Cannot remove admin privileges from the last admin user");
        }
        entity.isAdmin = data.isAdmin;
      }

      const saved = await this.repository.save(entity);

      logger.info({
        message: "User updated successfully",
        id: saved.id,
        username: saved.username,
      });

      return this.entityToSchema(saved);
    } catch (error) {
      logger.error({
        message: "Failed to update user",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updatePassword(id: number, newPassword: string): Promise<void> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new Error("User not found");
    }

    try {
      const password = await bcrypt.hash(newPassword, SALT_ROUNDS);

      entity.password = password;
      entity.salt = "";

      await this.repository.save(entity);

      logger.info({
        message: "User password updated successfully",
        id: entity.id,
        username: entity.username,
      });
    } catch (error) {
      logger.error({
        message: "Failed to update user password",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async deleteUser(id: number): Promise<void> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new Error("User not found");
    }

    const users = await this.repository.findAll();
    const adminCount = users.filter((u) => u.isAdmin && u.id !== id).length;

    if (entity.isAdmin && adminCount === 0) {
      throw new Error("Cannot delete the last admin user");
    }

    try {
      await this.repository.delete(id);

      logger.info({
        message: "User deleted successfully",
        id: entity.id,
        username: entity.username,
      });
    } catch (error) {
      logger.error({
        message: "Failed to delete user",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async verifyPassword(username: string, password: string): Promise<UserEntity | null> {
    try {
      const entity = await this.repository.findByUsername(username);
      if (!entity) return null;

      const isValid = await bcrypt.compare(password, entity.password);
      if (!isValid) {
        return null;
      }

      return entity;
    } catch (error) {
      logger.error({
        message: "Failed to verify password",
        username,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private entityToSchema(entity: UserEntity): User {
    return {
      id: entity.id,
      name: entity.name,
      username: entity.username,
      email: entity.email,
      isAdmin: entity.isAdmin,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}