import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { TYPES } from "../../di/types.js";
import { AccountEntity } from "../accounts/account.entity.js";

@injectable()
export class ProvidersRepository {
  constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

  private get qb(): SelectQueryBuilder<AccountEntity> {
    return this.dataSource
      .getRepository(AccountEntity)
      .createQueryBuilder("provider_account");
  }

  async findAll(userId: number): Promise<AccountEntity[]> {
    return this.qb
      .where("provider_account.userId = :userId", { userId })
      .orderBy("provider_account.createdAt", "DESC")
      .getMany();
  }

  async findById(userId: number, id: number): Promise<AccountEntity | null> {
    return this.qb
      .where("provider_account.id = :id", { id })
      .andWhere("provider_account.userId = :userId", { userId })
      .getOne();
  }

  async findBySource(userId: number, provider: string): Promise<AccountEntity[]> {
    return this.qb
      .where("provider_account.userId = :userId", { userId })
      .andWhere("provider_account.provider = :provider", { provider })
      .orderBy("provider_account.createdAt", "DESC")
      .getMany();
  }

  async save(entity: AccountEntity): Promise<AccountEntity> {
    return this.dataSource.getRepository(AccountEntity).save(entity);
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.dataSource.getRepository(AccountEntity)
      .createQueryBuilder()
      .delete()
      .where("id = :id AND user_id = :userId", { id, userId })
      .execute();
  }

  async count(): Promise<number> {
    return this.qb.getCount();
  }

  async exists(userId: number, id: number): Promise<boolean> {
    const count = await this.qb
      .where("provider_account.id = :id", { id })
      .andWhere("provider_account.userId = :userId", { userId })
      .getCount();
    return count > 0;
  }

  async existsBySource(
    userId: number,
    provider: string,
  ): Promise<boolean> {
    const count = await this.qb
      .where("provider_account.userId = :userId", { userId })
      .andWhere("provider_account.provider = :provider", { provider })
      .getCount();
    return count > 0;
  }
}