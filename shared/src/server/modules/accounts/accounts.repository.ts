import "reflect-metadata";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { AccountEntity } from "./account.entity.js";

export class AccountsRepository {
  constructor(private dataSource: DataSource) {}

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

  async delete(id: number): Promise<void> {
    await this.dataSource.getRepository(AccountEntity).delete(id);
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
}
