import "reflect-metadata";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { DateTime } from "luxon";
import { PortfolioSnapshotEntity } from "./portfolio-snapshot.entity.js";

export interface PortfolioSnapshotData {
	userId: number;
	providerAccountId: number;
	asset: string;
	date: DateTime;
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
		const results = await this.dataSource.query(`
			SELECT ps.*
			FROM portfolio_snapshots ps
			INNER JOIN (
				SELECT asset, MAX(date) as max_date
				FROM portfolio_snapshots
				WHERE user_id = ? AND provider_account_id = ?
				GROUP BY asset
			) latest ON ps.asset = latest.asset AND ps.date = latest.max_date
			WHERE ps.user_id = ? AND ps.provider_account_id = ?
		`, [userId, providerAccountId, userId, providerAccountId]);

		return results.map((row: any) => this.mapRowToEntity(row));
	}

	async findLatestByUser(userId: number): Promise<Map<number, PortfolioSnapshotEntity[]>> {
		const results = await this.dataSource.query(`
			SELECT ps.*
			FROM portfolio_snapshots ps
			INNER JOIN (
				SELECT provider_account_id, asset, MAX(date) as max_date
				FROM portfolio_snapshots
				WHERE user_id = ?
				GROUP BY provider_account_id, asset
			) latest ON ps.provider_account_id = latest.provider_account_id 
				AND ps.asset = latest.asset 
				AND ps.date = latest.max_date
			WHERE ps.user_id = ?
		`, [userId, userId]);

		const result = new Map<number, PortfolioSnapshotEntity[]>();
		for (const row of results) {
			const accountId = row.provider_account_id;
			if (!result.has(accountId)) {
				result.set(accountId, []);
			}
			result.get(accountId)!.push(this.mapRowToEntity(row));
		}

		return result;
	}

	async findByAccountAndDateRange(
		userId: number,
		providerAccountId: number,
		startDate: DateTime,
		endDate: DateTime,
	): Promise<PortfolioSnapshotEntity[]> {
		return this.qb
			.where("snapshot.userId = :userId AND snapshot.providerAccountId = :providerAccountId", {
				userId,
				providerAccountId,
			})
			.andWhere("snapshot.date >= :startDate", { startDate: startDate.toMillis() })
			.andWhere("snapshot.date <= :endDate", { endDate: endDate.toMillis() })
			.orderBy("snapshot.date", "ASC")
			.getMany();
	}

	async findByUserAndDateRange(
		userId: number,
		startDate: DateTime,
		endDate: DateTime,
	): Promise<PortfolioSnapshotEntity[]> {
		return this.qb
			.where("snapshot.userId = :userId", { userId })
			.andWhere("snapshot.date >= :startDate", { startDate: startDate.toMillis() })
			.andWhere("snapshot.date <= :endDate", { endDate: endDate.toMillis() })
			.orderBy("snapshot.date", "ASC")
			.getMany();
	}

	async findDistinctDates(
		userId: number,
		providerAccountId?: number,
	): Promise<DateTime[]> {
		let query = this.dataSource
			.getRepository(PortfolioSnapshotEntity)
			.createQueryBuilder("snapshot")
			.select("DISTINCT snapshot.date", "date")
			.where("snapshot.userId = :userId", { userId });

		if (providerAccountId) {
			query = query.andWhere("snapshot.providerAccountId = :providerAccountId", {
				providerAccountId,
			});
		}

		const results = await query
			.orderBy("snapshot.date", "ASC")
			.getRawMany();

		return results.map((r: any) => DateTime.fromMillis(Number(r.date)));
	}

	async deleteByAccountAndDateRange(
		userId: number,
		providerAccountId: number,
		fromDate: DateTime,
	): Promise<void> {
		await this.dataSource
			.getRepository(PortfolioSnapshotEntity)
			.createQueryBuilder()
			.delete()
			.where("user_id = :userId AND provider_account_id = :providerAccountId", {
				userId,
				providerAccountId,
			})
			.andWhere("date >= :fromDate", { fromDate: fromDate.toMillis() })
			.execute();
	}

	async save(data: PortfolioSnapshotData): Promise<PortfolioSnapshotEntity> {
		const entity = new PortfolioSnapshotEntity();
		entity.userId = data.userId;
		entity.providerAccountId = data.providerAccountId;
		entity.asset = data.asset;
		entity.date = data.date;
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
			entity.date = d.date;
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

	private mapRowToEntity(row: any): PortfolioSnapshotEntity {
		const entity = new PortfolioSnapshotEntity();
		entity.id = row.id;
		entity.userId = row.user_id;
		entity.providerAccountId = row.provider_account_id;
		entity.asset = row.asset;
		entity.date = DateTime.fromMillis(Number(row.date));
		entity.amount = Number(row.amount);
		entity.eurInvested = Number(row.eur_invested);
		entity.buyCount = row.buy_count;
		entity.sellCount = row.sell_count;
		entity.createdAt = DateTime.fromMillis(Number(row.created_at));
		entity.updatedAt = DateTime.fromMillis(Number(row.updated_at));
		return entity;
	}
}
