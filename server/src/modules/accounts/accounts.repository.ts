import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { DateTime } from "luxon";
import { TYPES } from "../../di/types.js";
import { AccountEntity } from "./account.entity.js";

@injectable()
export class AccountsRepository {
  constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

  private get qb(): SelectQueryBuilder<AccountEntity> {
    return this.dataSource
      .getRepository(AccountEntity)
      .createQueryBuilder("account");
  }

  async findAll(userId: number): Promise<AccountEntity[]> {
    return this.qb
      .where("account.userId = :userId", { userId })
      .orderBy("account.createdAt", "DESC")
      .getMany();
  }

  async findById(userId: number, id: number): Promise<AccountEntity | null> {
    return this.qb
      .where("account.id = :id", { id })
      .andWhere("account.userId = :userId", { userId })
      .getOne();
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
      .where("account.id = :id", { id })
      .andWhere("account.userId = :userId", { userId })
      .getCount();
    return count > 0;
  }

  async findEnabledApiSyncAccounts(): Promise<AccountEntity[]> {
    return this.qb
      .where("account.apiEnabled = :enabled", { enabled: true })
      .andWhere("account.apiKeyEncrypted IS NOT NULL")
      .getMany();
  }

  async updateSyncSuccess(account: AccountEntity): Promise<void> {
    account.lastSyncAt = DateTime.now();
    account.syncError = null;
    await this.dataSource.getRepository(AccountEntity).save(account);
  }

  async updateSyncError(accountId: number, error: string): Promise<void> {
    await this.dataSource
      .getRepository(AccountEntity)
      .createQueryBuilder()
      .update()
      .set({
        syncError: error,
        updatedAt: DateTime.now(),
      })
      .where("id = :accountId", { accountId })
      .execute();
  }
}
