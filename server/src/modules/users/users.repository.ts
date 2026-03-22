import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { TYPES } from "../../di/types.js";
import { UserEntity } from "./user.entity.js";

@injectable()
export class UsersRepository {
  constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

  private get qb(): SelectQueryBuilder<UserEntity> {
    return this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder("user");
  }

  async findAll(): Promise<UserEntity[]> {
    return this.qb.orderBy("user.createdAt", "DESC").getMany();
  }

  async findById(id: number): Promise<UserEntity | null> {
    return this.qb.where("user.id = :id", { id }).getOne();
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.qb.where("user.username = :username", { username }).getOne();
  }

  async count(): Promise<number> {
    return this.qb.getCount();
  }

  async save(entity: UserEntity): Promise<UserEntity> {
    return this.dataSource.getRepository(UserEntity).save(entity);
  }

  async delete(id: number): Promise<void> {
    await this.dataSource.getRepository(UserEntity).delete(id);
  }

  async exists(id: number): Promise<boolean> {
    const count = await this.qb.where("user.id = :id", { id }).getCount();
    return count > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await this.qb.where("user.username = :username", { username }).getCount();
    return count > 0;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.qb.where("user.email = :email", { email }).getCount();
    return count > 0;
  }
}