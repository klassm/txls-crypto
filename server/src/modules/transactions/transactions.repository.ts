import "reflect-metadata";
import type { AssetStat, YearStats } from "@txls/shared";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { TransactionType } from "@txls/shared";
import { Between } from "typeorm";
import { TransactionEntity } from "./transaction.entity.js";
import { DateTime } from "luxon";
import { toMillis } from "../../utils/date.js";

export class TransactionsRepository {
  constructor(private dataSource: DataSource) {}

  private get qb(): SelectQueryBuilder<TransactionEntity> {
    return this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder("transaction");
  }

async findByProviderAccountId(userId: number, providerAccountId: number): Promise<TransactionEntity[]> {
    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .orderBy("transaction.timestamp", "DESC")
      .getMany();
  }

  async findByProviderAccountIdAndYear(
    userId: number,
    providerAccountId: number,
    year: number,
  ): Promise<TransactionEntity[]> {
    const startDate = toMillis(DateTime.utc(year, 1, 1, 0, 0, 0, 0));
    const endDate = toMillis(DateTime.utc(year, 12, 31, 23, 59, 59, 999));

    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .andWhere("transaction.timestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .orderBy("transaction.timestamp", "DESC")
      .getMany();
  }

  async findOneByExternalId(
    externalId: string,
  ): Promise<TransactionEntity | null> {
    return this.qb
      .where("transaction.externalId = :externalId", { externalId })
      .getOne();
  }

  async findOneById(id: number): Promise<TransactionEntity | null> {
    return this.qb.where("transaction.id = :id", { id }).getOne();
  }

  async save(entity: TransactionEntity): Promise<TransactionEntity> {
    return this.dataSource.getRepository(TransactionEntity).save(entity);
  }

  async saveMany(entities: TransactionEntity[]): Promise<TransactionEntity[]> {
    return this.dataSource.getRepository(TransactionEntity).save(entities);
  }

  async delete(id: number): Promise<void> {
    await this.qb.where("transaction.id = :id", { id }).delete();
  }

  async deleteByProviderAccountId(userId: number, providerAccountId: number): Promise<void> {
    await this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder()
      .delete()
      .where("user_id = :userId AND provider_account_id = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .execute();
  }

  async countByProviderAccountId(userId: number, providerAccountId: number): Promise<number> {
    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .getCount();
  }

  async countByProviderAccountIdAndYear(
    userId: number,
    providerAccountId: number,
    year: number,
  ): Promise<number> {
    const startDate = toMillis(DateTime.utc(year, 1, 1, 0, 0, 0, 0));
    const endDate = toMillis(DateTime.utc(year, 12, 31, 23, 59, 59, 999));

    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .andWhere("transaction.timestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .getCount();
  }

  async findByProviderAccountIdAndType(
    userId: number,
    providerAccountId: number,
    type: TransactionType,
  ): Promise<TransactionEntity[]> {
    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .andWhere("transaction.type = :type", { type })
      .orderBy("transaction.timestamp", "DESC")
      .getMany();
  }

  async findByProviderAccountIdAndTypeAndYear(
    userId: number,
    providerAccountId: number,
    type: TransactionType,
    year: number,
  ): Promise<TransactionEntity[]> {
    const startDate = toMillis(DateTime.utc(year, 1, 1, 0, 0, 0, 0));
    const endDate = toMillis(DateTime.utc(year, 12, 31, 23, 59, 59, 999));

    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .andWhere("transaction.type = :type", { type })
      .andWhere("transaction.timestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .orderBy("transaction.timestamp", "DESC")
      .getMany();
  }

async getStatsByProviderAccountIdAndYear(
    userId: number,
    providerAccountId: number,
    year: number,
  ): Promise<YearStats> {
    const startDate = toMillis(DateTime.utc(year, 1, 1, 0, 0, 0, 0));
    const endDate = toMillis(DateTime.utc(year, 12, 31, 23, 59, 59, 999));

    const stats = await this.qb
      .select([
        "transaction.type AS type",
        "transaction.asset AS asset",
        "COUNT(transaction.id) AS count",
        "SUM(transaction.quantity) AS totalQuantity",
        "SUM(transaction.eurValue) AS totalEurValue",
      ])
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .andWhere("transaction.timestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .groupBy("transaction.type, transaction.asset")
      .getRawMany();

    const assetStatsMap = new Map<
      string,
      { amount: number; buys: number; sells: number }
    >();

    const staking = { cryptoAmount: 0, fiatAmount: 0, count: 0 };
    const buys = { cryptoAmount: 0, fiatAmount: 0, count: 0 };
    const sells = { cryptoAmount: 0, fiatAmount: 0, count: 0 };

    for (const stat of stats) {
      const type = stat.type as TransactionType;
      const asset = stat.asset;
      const totalQuantity = Number(stat.totalQuantity) || 0;
      const totalEurValue = Number(stat.totalEurValue) || 0;
      const count = Number(stat.count) || 0;

      if (type === TransactionType.buy) {
        buys.cryptoAmount += totalQuantity;
        buys.fiatAmount += totalEurValue;
        buys.count += count;
      } else if (type === TransactionType.sell) {
        sells.cryptoAmount += Math.abs(totalQuantity);
        sells.fiatAmount += Math.abs(totalEurValue);
        sells.count += count;
      } else if (type === TransactionType.reward) {
        staking.cryptoAmount += totalQuantity;
        staking.fiatAmount += Math.abs(totalEurValue);
        staking.count += count;
      }

      const existing = assetStatsMap.get(asset) || {
        amount: 0,
        buys: 0,
        sells: 0,
      };

      if (type === TransactionType.buy) {
        existing.amount += totalQuantity;
        existing.buys += count;
      } else if (type === TransactionType.sell) {
        existing.amount -= Math.abs(totalQuantity);
        existing.sells += count;
      } else if (type === TransactionType.reward) {
        existing.amount += totalQuantity;
      }

      assetStatsMap.set(asset, existing);
    }

    return {
      year,
      staking,
      buys,
      sells,
      assetStats: Array.from(assetStatsMap.entries()).map(([asset, data]) => ({
        asset,
        ...data,
      })),
    };
  }

  async existsByExternalId(externalId: string): Promise<boolean> {
    const count = await this.qb
      .where("transaction.externalId = :externalId", { externalId })
      .getCount();
    return count > 0;
  }

  async findManyByExternalIds(
    externalIds: string[],
  ): Promise<TransactionEntity[]> {
    if (externalIds.length === 0) {
      return [];
    }

    return this.qb
      .where("transaction.externalId IN (:...externalIds)", { externalIds })
      .getMany();
  }

  async getExternalIdsByAccountId(accountId: number): Promise<Set<string>> {
    const rows = await this.qb
      .select("transaction.externalId")
      .where("transaction.providerAccountId = :accountId", { accountId })
      .getRawMany();

    return new Set(rows.map((row) => row.external_id));
  }

  async getAvailableYears(userId: number, providerAccountId: number): Promise<number[]> {
    const rows = await this.qb
      .select("transaction.timestamp AS timestamp")
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", { userId, providerAccountId })
      .orderBy("transaction.timestamp", "DESC")
      .getRawMany();

    const years = new Set<number>();
    for (const row of rows) {
      const timestamp = typeof row.timestamp === "string" ? parseInt(row.timestamp, 10) : row.timestamp;
      const dt = DateTime.fromMillis(timestamp);
      if (dt.isValid) {
        years.add(dt.year);
      }
    }

    return Array.from(years).sort((a, b) => b - a);
  }

  async getAssetSummaryByProviderAccountId(userId: number, providerAccountId: number): Promise<AssetStat[]> {
    const stats = await this.qb
      .select([
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", {
        userId,
        providerAccountId,
        buy: TransactionType.buy,
        sell: TransactionType.sell,
      })
      .groupBy("transaction.asset")
      .getRawMany();

    return stats
      .filter((stat) => stat.amount !== null && stat.amount !== 0)
      .map((stat) => ({
        asset: stat.asset,
        amount: Number(stat.amount) || 0,
        buys: Number(stat.buys) || 0,
        sells: Number(stat.sells) || 0,
      }));
  }

  async getAllAssetSummaries(userId?: number): Promise<Map<number, AssetStat[]>> {
    let query = this.qb
      .select([
        "transaction.providerAccountId AS providerAccountId",
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where("1=1", {
        buy: TransactionType.buy,
        sell: TransactionType.sell,
      });

    if (userId) {
      query = query.andWhere("transaction.userId = :userId", { userId });
    }

    const stats = await query
      .groupBy("transaction.providerAccountId, transaction.asset")
      .getRawMany();

    const result = stats.reduce<Map<number, AssetStat[]>>((acc, stat) => {
      const providerAccountId = Number(stat.providerAccountId);
      const amount = Number(stat.amount) || 0;

      if (amount !== 0) {
        if (!acc.has(providerAccountId)) {
          acc.set(providerAccountId, []);
        }

        acc.get(providerAccountId)!.push({
          asset: stat.asset,
          amount,
          buys: Number(stat.buys) || 0,
          sells: Number(stat.sells) || 0,
        });
      }

      return acc;
    }, new Map());

    return result;
  }
}
