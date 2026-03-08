import type { DataSource } from "typeorm";
import type { AssetStat } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { PortfolioSnapshotsRepository, type PortfolioSnapshotData } from "./portfolio-snapshots.repository.js";
import { PortfolioSnapshotEntity } from "./portfolio-snapshot.entity.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { logger } from "../../common/logger.js";

interface MonthlyAssetData {
  asset: string;
  amount: number;
  eurInvested: number;
  buyCount: number;
  sellCount: number;
}

export class PortfolioSnapshotsService {
  private repository: PortfolioSnapshotsRepository;
  private dataSource: DataSource;

  constructor(dataSource: DataSource, repository?: PortfolioSnapshotsRepository) {
    this.dataSource = dataSource;
    this.repository = repository || new PortfolioSnapshotsRepository(dataSource);
  }

  async getCurrentHoldings(userId: number, providerAccountId: number): Promise<AssetStat[]> {
    const snapshots = await this.repository.findLatestByAccount(userId, providerAccountId);

    if (snapshots.length > 0) {
      return this.snapshotsToAssetStats(snapshots);
    }

    return this.calculateHoldings(userId, providerAccountId);
  }

  async getAllCurrentHoldings(userId: number): Promise<Map<number, AssetStat[]>> {
    const snapshots = await this.repository.findLatestByUser(userId);

    if (snapshots.size > 0) {
      const result = new Map<number, AssetStat[]>();
      for (const [accountId, accountSnapshots] of snapshots) {
        result.set(accountId, this.snapshotsToAssetStats(accountSnapshots));
      }
      return result;
    }

    return this.calculateAllHoldings(userId);
  }

  async rebuildFromMonth(
    userId: number,
    providerAccountId: number,
    year: number,
    month: number,
  ): Promise<void> {
    logger.info({
      message: "Rebuilding portfolio snapshots from month",
      userId,
      providerAccountId,
      year,
      month,
    });

    await this.repository.deleteByAccountAndDateRange(userId, providerAccountId, year, month);

    const earliestTransaction = await this.findEarliestTransaction(userId, providerAccountId, year, month);
    if (!earliestTransaction) {
      return;
    }

    const startYear = earliestTransaction.year;
    const startMonth = earliestTransaction.month;
    const now = DateTime.now();

    let currentYear = startYear;
    let currentMonth = startMonth;

    while (currentYear < now.year || (currentYear === now.year && currentMonth <= now.month)) {
      await this.buildSnapshotForMonth(userId, providerAccountId, currentYear, currentMonth);

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
  }

  async rebuildAll(userId: number, providerAccountId: number): Promise<void> {
    logger.info({
      message: "Rebuilding all portfolio snapshots",
      userId,
      providerAccountId,
    });

    await this.repository.deleteByAccount(userId, providerAccountId);

    const earliestTransaction = await this.findEarliestTransaction(userId, providerAccountId);
    if (!earliestTransaction) {
      return;
    }

    await this.rebuildFromMonth(
      userId,
      providerAccountId,
      earliestTransaction.year,
      earliestTransaction.month,
    );
  }

  private async buildSnapshotForMonth(
    userId: number,
    providerAccountId: number,
    year: number,
    month: number,
  ): Promise<void> {
    const monthEnd = DateTime.utc(year, month, 1).endOf("month");
    const monthEndMillis = monthEnd.toMillis();

    const assetData = await this.calculateHoldingsUpTo(
      userId,
      providerAccountId,
      monthEndMillis,
    );

    const snapshotData: PortfolioSnapshotData[] = assetData
      .filter((data) => data.amount > 0)
      .map((data) => ({
        userId,
        providerAccountId,
        asset: data.asset,
        year,
        month,
        amount: data.amount,
        eurInvested: data.eurInvested,
        buyCount: data.buyCount,
        sellCount: data.sellCount,
      }));

    if (snapshotData.length > 0) {
      await this.repository.saveMany(snapshotData);
    }
  }

  private async calculateHoldingsUpTo(
    userId: number,
    providerAccountId: number,
    timestampLimit: number,
  ): Promise<MonthlyAssetData[]> {
    const qb = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder("transaction");

    const stats = await qb
      .select([
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN transaction.eurValue ELSE 0 END) AS eurInvested",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where(
        "transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
        { userId, providerAccountId, buy: TransactionType.buy, sell: TransactionType.sell },
      )
      .andWhere("transaction.timestamp <= :timestampLimit", { timestampLimit })
      .groupBy("transaction.asset")
      .getRawMany();

    return stats.map((stat) => ({
      asset: stat.asset,
      amount: Number(stat.amount) || 0,
      eurInvested: Number(stat.eurInvested) || 0,
      buyCount: Number(stat.buys) || 0,
      sellCount: Number(stat.sells) || 0,
    }));
  }

  private async calculateHoldings(
    userId: number,
    providerAccountId: number,
  ): Promise<AssetStat[]> {
    const qb = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder("transaction");

    const stats = await qb
      .select([
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where(
        "transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
        { userId, providerAccountId, buy: TransactionType.buy, sell: TransactionType.sell },
      )
      .groupBy("transaction.asset")
      .getRawMany();

    return stats
      .filter((stat) => stat.amount !== null && Number(stat.amount) !== 0)
      .map((stat) => ({
        asset: stat.asset,
        amount: Number(stat.amount) || 0,
        buys: Number(stat.buys) || 0,
        sells: Number(stat.sells) || 0,
      }));
  }

  private async calculateAllHoldings(userId: number): Promise<Map<number, AssetStat[]>> {
    const qb = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder("transaction");

    const stats = await qb
      .select([
        "transaction.providerAccountId AS providerAccountId",
        "transaction.asset AS asset",
        "SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
        "SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
        "SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
      ])
      .where("transaction.userId = :userId", { userId, buy: TransactionType.buy, sell: TransactionType.sell })
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
        buys: Number(stat.buys) || 0,
        sells: Number(stat.sells) || 0,
      });
    }

    return result;
  }

  private async findEarliestTransaction(
    userId: number,
    providerAccountId: number,
    fromYear?: number,
    fromMonth?: number,
  ): Promise<{ year: number; month: number } | null> {
    const qb = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder("transaction");

    let query = qb
      .where(
        "transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
        { userId, providerAccountId },
      )
      .orderBy("transaction.timestamp", "ASC")
      .select("transaction.timestamp");

    if (fromYear !== undefined && fromMonth !== undefined) {
      const startDate = DateTime.utc(fromYear, fromMonth, 1);
      query = query.andWhere("transaction.timestamp >= :startDate", {
        startDate: startDate.toMillis(),
      });
    }

    const transaction = await query.getOne();

    if (!transaction) {
      return null;
    }

    const dt = transaction.timestamp as DateTime;
    return { year: dt.year, month: dt.month };
  }

  private snapshotsToAssetStats(snapshots: PortfolioSnapshotEntity[]): AssetStat[] {
    return snapshots.map((s) => ({
      asset: s.asset,
      amount: s.amount,
      buys: s.buyCount,
      sells: s.sellCount,
    }));
  }
}
