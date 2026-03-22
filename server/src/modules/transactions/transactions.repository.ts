import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { AssetStat, YearStats } from "@txls/shared";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { TransactionType } from "@txls/shared";
import { Between } from "typeorm";
import { TYPES } from "../../di/types.js";
import { TransactionEntity } from "./transaction.entity.js";
import { DateTime } from "luxon";
import { toMillis } from "../../utils/date.js";

@injectable()
export class TransactionsRepository {
  constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

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
    userId: number,
    externalId: string,
  ): Promise<TransactionEntity | null> {
    return this.qb
      .where("transaction.userId = :userId AND transaction.externalId = :externalId", { userId, externalId })
      .getOne();
  }

  async findOneById(userId: number, id: number): Promise<TransactionEntity | null> {
    return this.qb.where("transaction.userId = :userId AND transaction.id = :id", { userId, id }).getOne();
  }

  async save(entity: TransactionEntity): Promise<TransactionEntity> {
    return this.dataSource.getRepository(TransactionEntity).save(entity);
  }

  async saveMany(entities: TransactionEntity[]): Promise<TransactionEntity[]> {
    return this.dataSource.getRepository(TransactionEntity).save(entities);
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.qb.where("transaction.userId = :userId AND transaction.id = :id", { userId, id }).delete();
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
      { amount: number; eurInvested: number; buys: number; sells: number }
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
        eurInvested: 0,
        buys: 0,
        sells: 0,
      };

      if (type === TransactionType.buy) {
        existing.amount += totalQuantity;
        existing.eurInvested += totalEurValue;
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

  async existsByExternalId(userId: number, externalId: string): Promise<boolean> {
    const count = await this.qb
      .where("transaction.userId = :userId AND transaction.externalId = :externalId", { userId, externalId })
      .getCount();
    return count > 0;
  }

  async findManyByExternalIds(
    userId: number,
    externalIds: string[],
  ): Promise<TransactionEntity[]> {
    if (externalIds.length === 0) {
      return [];
    }

    return this.qb
      .where("transaction.userId = :userId AND transaction.externalId IN (:...externalIds)", { userId, externalIds })
      .getMany();
  }

  async getExternalIdsByAccountId(userId: number, accountId: number): Promise<Set<string>> {
    const rows = await this.qb
      .select("transaction.externalId")
      .where("transaction.userId = :userId AND transaction.providerAccountId = :accountId", { userId, accountId })
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
        "SUM(CASE WHEN transaction.type IN (:sell, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN transaction.eurValue ELSE 0 END) AS eurInvested",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", {
        userId,
        providerAccountId,
        buy: TransactionType.buy,
        sell: TransactionType.sell,
        withdrawal: TransactionType.withdrawal,
      })
      .groupBy("transaction.asset")
      .getRawMany();

    return stats
      .filter((stat) => stat.amount !== null && stat.amount !== 0)
      .map((stat) => ({
        asset: stat.asset,
        amount: Number(stat.amount) || 0,
        eurInvested: Number(stat.eurInvested) || 0,
        buys: Number(stat.buys) || 0,
        sells: Number(stat.sells) || 0,
      }));
  }

  async findByUserId(userId: number): Promise<TransactionEntity[]> {
    return this.qb
      .where("transaction.userId = :userId", { userId })
      .orderBy("transaction.timestamp", "ASC")
      .getMany();
  }

  async getTotalStakingRewards(userId: number): Promise<{ eurValue: number; count: number }> {
    const result = await this.qb
      .select([
        "COALESCE(SUM(ABS(transaction.eurValue)), 0) AS totalEurValue",
        "COUNT(transaction.id) AS count",
      ])
      .where("transaction.userId = :userId", { userId })
      .andWhere("transaction.type = :type", { type: TransactionType.reward })
      .getRawOne();

    return {
      eurValue: Number(result?.totalEurValue) || 0,
      count: Number(result?.count) || 0,
    };
  }

  async getStakingRewardsByYear(userId: number, year: number): Promise<{ eurValue: number; count: number }> {
    const startDate = toMillis(DateTime.utc(year, 1, 1, 0, 0, 0, 0));
    const endDate = toMillis(DateTime.utc(year, 12, 31, 23, 59, 59, 999));

    const result = await this.qb
      .select([
        "COALESCE(SUM(ABS(transaction.eurValue)), 0) AS totalEurValue",
        "COUNT(transaction.id) AS count",
      ])
      .where("transaction.userId = :userId", { userId })
      .andWhere("transaction.type = :type", { type: TransactionType.reward })
      .andWhere("transaction.timestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .getRawOne();

    return {
      eurValue: Number(result?.totalEurValue) || 0,
      count: Number(result?.count) || 0,
    };
  }

  async updateLinkedTransaction(
    userId: number,
    transactionId: number,
    linkedTransactionId: number,
    originalAcquisitionTimestamp?: number,
    originalEurValue?: number
  ): Promise<void> {
    const updateData: Record<string, unknown> = { linkedTransactionId };
    if (originalAcquisitionTimestamp !== undefined) {
      updateData.originalAcquisitionTimestamp = originalAcquisitionTimestamp;
    }
    if (originalEurValue !== undefined) {
      updateData.originalEurValue = originalEurValue;
    }
    await this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder()
      .update()
      .set(updateData)
      .where("userId = :userId AND id = :transactionId", { userId, transactionId })
      .execute();
  }

  async getAllAssetSummaries(userId?: number): Promise<Map<number, AssetStat[]>> {
    let query = this.qb
      .select([
        "transaction.providerAccountId AS providerAccountId",
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type IN (:sell, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN transaction.eurValue ELSE 0 END) AS eurInvested",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where("1=1", {
        buy: TransactionType.buy,
        sell: TransactionType.sell,
        withdrawal: TransactionType.withdrawal,
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
          eurInvested: Number(stat.eurInvested) || 0,
          buys: Number(stat.buys) || 0,
          sells: Number(stat.sells) || 0,
        });
      }

      return acc;
    }, new Map());

    return result;
  }

  async findTransactionsByAccountOrdered(
    userId: number,
    providerAccountId: number
  ): Promise<TransactionEntity[]> {
    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .orderBy("transaction.timestamp", "ASC")
      .getMany();
  }

  async findTransactionsByAccountFromTimestamp(
    userId: number,
    providerAccountId: number,
    fromTimestamp: DateTime
  ): Promise<TransactionEntity[]> {
    return this.qb
      .where("transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .andWhere("transaction.timestamp >= :fromTimestamp", {
        fromTimestamp: fromTimestamp.toMillis(),
      })
      .orderBy("transaction.timestamp", "ASC")
      .getMany();
  }

  async calculateHoldingsByAccount(
    userId: number,
    providerAccountId: number
  ): Promise<AssetStat[]> {
    const stats = await this.qb
      .select([
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type IN (:sell, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type IN (:buy, :deposit) THEN transaction.eurValue ELSE 0 END) AS eurInvested",
      ])
      .where(
        "transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
        {
          userId,
          providerAccountId,
          sell: TransactionType.sell,
          withdrawal: TransactionType.withdrawal,
          buy: TransactionType.buy,
          deposit: TransactionType.deposit,
        }
      )
      .groupBy("transaction.asset")
      .getRawMany();

    return stats
      .filter((stat) => stat.amount !== null && Number(stat.amount) !== 0)
      .map((stat) => ({
        asset: stat.asset,
        amount: Number(stat.amount) || 0,
        eurInvested: Number(stat.eurInvested) || 0,
        buys: 0,
        sells: 0,
      }));
  }

  async calculateAllHoldingsByUser(
    userId: number
  ): Promise<Map<number, AssetStat[]>> {
    const stats = await this.qb
      .select([
        "transaction.providerAccountId AS providerAccountId",
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type IN (:sell, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type IN (:buy, :deposit) THEN transaction.eurValue ELSE 0 END) AS eurInvested",
      ])
      .where("transaction.userId = :userId", {
        userId,
        sell: TransactionType.sell,
        withdrawal: TransactionType.withdrawal,
        buy: TransactionType.buy,
        deposit: TransactionType.deposit,
      })
      .groupBy("transaction.providerAccountId, transaction.asset")
      .getRawMany();

    const result = new Map<number, AssetStat[]>();

    for (const stat of stats) {
      const amount = Number(stat.amount) || 0;
      if (amount === 0) continue;

      const providerAccountId = Number(stat.providerAccountId);
      if (!result.has(providerAccountId)) {
        result.set(providerAccountId, []);
      }

      result.get(providerAccountId)!.push({
        asset: stat.asset,
        amount,
        eurInvested: Number(stat.eurInvested) || 0,
        buys: 0,
        sells: 0,
      });
    }

    return result;
  }

  async getDistinctAssets(userId?: number): Promise<string[]> {
    let query = this.qb
      .select("DISTINCT transaction.asset", "asset");

    if (userId) {
      query = query.where("transaction.userId = :userId", { userId });
    }

    const results = await query.getRawMany();
    return results.map((r) => r.asset as string).filter((s) => s);
  }

  async findTransactionsInTimeRange(
    accountId: number,
    minTimestamp: number,
    maxTimestamp: number,
    userId?: number
  ): Promise<TransactionEntity[]> {
    let query = this.qb
      .where("transaction.providerAccountId = :accountId", { accountId })
      .andWhere("transaction.timestamp BETWEEN :minTimestamp AND :maxTimestamp", {
        minTimestamp,
        maxTimestamp,
      });

    if (userId !== undefined) {
      query = query.andWhere("transaction.userId = :userId", { userId });
    }

    return query.orderBy("transaction.timestamp", "ASC").getMany();
  }

  async deleteTransactionsInTimeRange(
    accountId: number,
    minTimestamp: number,
    maxTimestamp: number,
    userId?: number
  ): Promise<number> {
    const qb = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder()
      .delete()
      .where("provider_account_id = :accountId", { accountId })
      .andWhere("timestamp BETWEEN :minTimestamp AND :maxTimestamp", {
        minTimestamp,
        maxTimestamp,
      });

    if (userId !== undefined) {
      qb.andWhere("user_id = :userId", { userId });
    }

    const result = await qb.execute();
    return result.affected || 0;
  }

  async deleteAllByAccount(userId: number, accountId: number): Promise<number> {
    const result = await this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder()
      .delete()
      .where("user_id = :userId AND provider_account_id = :accountId", { userId, accountId })
      .execute();
    return result.affected || 0;
  }
}
