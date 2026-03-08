import "reflect-metadata";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { PortfolioSnapshotEntity } from "./portfolio-snapshot.entity.js";

export interface PortfolioSnapshotData {
  userId: number;
  providerAccountId: number;
  asset: string;
  year: number;
  month: number;
  amount: number;
  eurInvested: number;
  buyCount: number;
  sellCount: number;
}

export class PortfolioSnapshotsRepository {
  constructor(private dataSource: DataSource) {}

  private get qb(): SelectQueryBuilder<PortfolioSnapshotEntity> {
    return this.dataSource
      .getRepository(PortfolioSnapshotEntity)
      .createQueryBuilder("snapshot");
  }

  async findLatestByAccount(
    userId: number,
    providerAccountId: number,
  ): Promise<PortfolioSnapshotEntity[]> {
    const latest = await this.dataSource
      .getRepository(PortfolioSnapshotEntity)
      .createQueryBuilder("snapshot")
      .where("snapshot.user_id = :userId AND snapshot.provider_account_id = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .orderBy("snapshot.year", "DESC")
      .addOrderBy("snapshot.month", "DESC")
      .getMany();

    const result: PortfolioSnapshotEntity[] = [];
    const seenAssets = new Set<string>();

    for (const snapshot of latest) {
      if (!seenAssets.has(snapshot.asset)) {
        seenAssets.add(snapshot.asset);
        result.push(snapshot);
      }
    }

    return result;
  }

  async findLatestByUser(userId: number): Promise<Map<number, PortfolioSnapshotEntity[]>> {
    const snapshots = await this.dataSource
      .getRepository(PortfolioSnapshotEntity)
      .createQueryBuilder("snapshot")
      .where("snapshot.user_id = :userId", { userId })
      .orderBy("snapshot.provider_account_id", "ASC")
      .addOrderBy("snapshot.year", "DESC")
      .addOrderBy("snapshot.month", "DESC")
      .getMany();

    const result = new Map<number, PortfolioSnapshotEntity[]>();
    const seenAssetsByAccount = new Map<number, Set<string>>();

    for (const snapshot of snapshots) {
      const accountId = snapshot.providerAccountId;
      if (!seenAssetsByAccount.has(accountId)) {
        seenAssetsByAccount.set(accountId, new Set());
      }

      const seenAssets = seenAssetsByAccount.get(accountId)!;
      if (!seenAssets.has(snapshot.asset)) {
        seenAssets.add(snapshot.asset);
        if (!result.has(accountId)) {
          result.set(accountId, []);
        }
        result.get(accountId)!.push(snapshot);
      }
    }

    return result;
  }

  async findByAccountAndDateRange(
    userId: number,
    providerAccountId: number,
    fromYear: number,
    fromMonth: number,
  ): Promise<PortfolioSnapshotEntity[]> {
    return this.dataSource
      .getRepository(PortfolioSnapshotEntity)
      .createQueryBuilder("snapshot")
      .where("snapshot.user_id = :userId AND snapshot.provider_account_id = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .andWhere(
        "(snapshot.year > :fromYear OR (snapshot.year = :fromYear AND snapshot.month >= :fromMonth))",
        { fromYear, fromMonth },
      )
      .getMany();
  }

  async deleteByAccountAndDateRange(
    userId: number,
    providerAccountId: number,
    fromYear: number,
    fromMonth: number,
  ): Promise<void> {
    await this.dataSource
      .getRepository(PortfolioSnapshotEntity)
      .createQueryBuilder()
      .delete()
      .where("user_id = :userId AND provider_account_id = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .andWhere(
        "(year > :fromYear OR (year = :fromYear AND month >= :fromMonth))",
        { fromYear, fromMonth },
      )
      .execute();
  }

  async save(data: PortfolioSnapshotData): Promise<PortfolioSnapshotEntity> {
    const entity = new PortfolioSnapshotEntity();
    entity.userId = data.userId;
    entity.providerAccountId = data.providerAccountId;
    entity.asset = data.asset;
    entity.year = data.year;
    entity.month = data.month;
    entity.amount = data.amount;
    entity.eurInvested = data.eurInvested;
    entity.buyCount = data.buyCount;
    entity.sellCount = data.sellCount;

    return this.dataSource.getRepository(PortfolioSnapshotEntity).save(entity);
  }

  async saveMany(data: PortfolioSnapshotData[]): Promise<PortfolioSnapshotEntity[]> {
    const entities = data.map((d) => {
      const entity = new PortfolioSnapshotEntity();
      entity.userId = d.userId;
      entity.providerAccountId = d.providerAccountId;
      entity.asset = d.asset;
      entity.year = d.year;
      entity.month = d.month;
      entity.amount = d.amount;
      entity.eurInvested = d.eurInvested;
      entity.buyCount = d.buyCount;
      entity.sellCount = d.sellCount;
      return entity;
    });

    return this.dataSource.getRepository(PortfolioSnapshotEntity).save(entities);
  }

  async deleteByAccount(userId: number, providerAccountId: number): Promise<void> {
    await this.dataSource
      .getRepository(PortfolioSnapshotEntity)
      .createQueryBuilder()
      .delete()
      .where("user_id = :userId AND provider_account_id = :providerAccountId", {
        userId,
        providerAccountId,
      })
      .execute();
  }
}
