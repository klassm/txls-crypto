import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { TYPES } from "../../di/types.js";
import { AssetHoldingEntity } from "./asset-holding.entity.js";

export interface AssetHoldingData {
	userId: number;
	providerAccountId: number;
	asset: string;
	amount: number;
	eurInvested: number;
	timestamp: DateTime;
}

export interface HoldingState {
	asset: string;
	amount: number;
	eurInvested: number;
}

@injectable()
export class AssetHoldingsRepository {
	constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

	async findLatestByAccount(
		userId: number,
		providerAccountId: number
	): Promise<Map<string, HoldingState>> {
		const results = await this.dataSource
			.createQueryBuilder()
			.select("ah.*")
			.from("asset_holdings", "ah")
			.innerJoin(
				(subQuery) =>
					subQuery
						.select("asset")
						.addSelect("MAX(timestamp)", "max_timestamp")
						.from("asset_holdings", "sub_ah")
						.where("sub_ah.user_id = :userId", { userId })
						.andWhere("sub_ah.provider_account_id = :providerAccountId", { providerAccountId })
						.groupBy("asset"),
				"latest",
				"ah.asset = latest.asset AND ah.timestamp = latest.max_timestamp"
			)
			.where("ah.user_id = :userId", { userId })
			.andWhere("ah.provider_account_id = :providerAccountId", { providerAccountId })
			.getRawMany();

		const holdings = new Map<string, HoldingState>();
		for (const row of results) {
			holdings.set(row.asset, {
				asset: row.asset,
				amount: Number(row.amount),
				eurInvested: Number(row.eur_invested),
			});
		}

		return holdings;
	}

	async findLatestByUser(userId: number): Promise<Map<number, Map<string, HoldingState>>> {
		const results = await this.dataSource
			.createQueryBuilder()
			.select("ah.*")
			.from("asset_holdings", "ah")
			.innerJoin(
				(subQuery) =>
					subQuery
						.select("provider_account_id")
						.addSelect("asset")
						.addSelect("MAX(timestamp)", "max_timestamp")
						.from("asset_holdings", "sub_ah")
						.where("sub_ah.user_id = :userId", { userId })
						.groupBy("provider_account_id")
						.addGroupBy("asset"),
				"latest",
				"ah.provider_account_id = latest.provider_account_id " +
					"AND ah.asset = latest.asset " +
					"AND ah.timestamp = latest.max_timestamp"
			)
			.where("ah.user_id = :userId", { userId })
			.getRawMany();

		const holdingsByAccount = new Map<number, Map<string, HoldingState>>();
		for (const row of results) {
			const accountId = row.provider_account_id;
			if (!holdingsByAccount.has(accountId)) {
				holdingsByAccount.set(accountId, new Map());
			}
			holdingsByAccount.get(accountId)!.set(row.asset, {
				asset: row.asset,
				amount: Number(row.amount),
				eurInvested: Number(row.eur_invested),
			});
		}

		return holdingsByAccount;
	}

	async getHoldingsUpToTimestamp(
		userId: number,
		providerAccountId: number,
		timestamp: DateTime
	): Promise<Map<string, HoldingState>> {
		const ts = timestamp.toMillis();
		const results = await this.dataSource
			.createQueryBuilder()
			.select("ah.*")
			.from("asset_holdings", "ah")
			.innerJoin(
				(subQuery) =>
					subQuery
						.select("asset")
						.addSelect("MAX(timestamp)", "max_timestamp")
						.from("asset_holdings", "sub_ah")
						.where("sub_ah.user_id = :userId", { userId })
						.andWhere("sub_ah.provider_account_id = :providerAccountId", { providerAccountId })
						.andWhere("sub_ah.timestamp <= :ts", { ts })
						.groupBy("asset"),
				"latest",
				"ah.asset = latest.asset AND ah.timestamp = latest.max_timestamp"
			)
			.where("ah.user_id = :userId", { userId })
			.andWhere("ah.provider_account_id = :providerAccountId", { providerAccountId })
			.setParameters({ userId, providerAccountId, ts })
			.getRawMany();

		const holdings = new Map<string, HoldingState>();
		for (const row of results) {
			holdings.set(row.asset, {
				asset: row.asset,
				amount: Number(row.amount),
				eurInvested: Number(row.eur_invested),
			});
		}

		return holdings;
	}

	async getAllHoldingsUpToTimestamp(
		userId: number,
		timestamp: DateTime
	): Promise<Map<number, Map<string, HoldingState>>> {
		const ts = timestamp.toMillis();
		const results = await this.dataSource
			.createQueryBuilder()
			.select("ah.*")
			.from("asset_holdings", "ah")
			.innerJoin(
				(subQuery) =>
					subQuery
						.select("provider_account_id")
						.addSelect("asset")
						.addSelect("MAX(timestamp)", "max_timestamp")
						.from("asset_holdings", "sub_ah")
						.where("sub_ah.user_id = :userId", { userId })
						.andWhere("sub_ah.timestamp <= :ts", { ts })
						.groupBy("provider_account_id")
						.addGroupBy("asset"),
				"latest",
				"ah.provider_account_id = latest.provider_account_id " +
					"AND ah.asset = latest.asset " +
					"AND ah.timestamp = latest.max_timestamp"
			)
			.where("ah.user_id = :userId", { userId })
			.setParameters({ userId, ts })
			.getRawMany();

		const holdingsByAccount = new Map<number, Map<string, HoldingState>>();
		for (const row of results) {
			const accountId = row.provider_account_id;
			if (!holdingsByAccount.has(accountId)) {
				holdingsByAccount.set(accountId, new Map());
			}
			holdingsByAccount.get(accountId)!.set(row.asset, {
				asset: row.asset,
				amount: Number(row.amount),
				eurInvested: Number(row.eur_invested),
			});
		}

		return holdingsByAccount;
	}

	async save(data: AssetHoldingData): Promise<AssetHoldingEntity> {
		const entity = new AssetHoldingEntity();
		entity.userId = data.userId;
		entity.providerAccountId = data.providerAccountId;
		entity.asset = data.asset;
		entity.amount = data.amount;
		entity.eurInvested = data.eurInvested;
		entity.timestamp = data.timestamp;

		return this.dataSource.getRepository(AssetHoldingEntity).save(entity);
	}

	async saveMany(data: AssetHoldingData[]): Promise<void> {
		if (data.length === 0) return;

		const entities = data.map((d) => {
			const entity = new AssetHoldingEntity();
			entity.userId = d.userId;
			entity.providerAccountId = d.providerAccountId;
			entity.asset = d.asset;
			entity.amount = d.amount;
			entity.eurInvested = d.eurInvested;
			entity.timestamp = d.timestamp;
			return entity;
		});

		await this.dataSource
			.getRepository(AssetHoldingEntity)
			.createQueryBuilder()
			.insert()
			.values(entities)
			.orIgnore()
			.execute();
	}

	async deleteByAccount(userId: number, providerAccountId: number): Promise<void> {
		await this.dataSource
			.getRepository(AssetHoldingEntity)
			.createQueryBuilder()
			.delete()
			.where("user_id = :userId AND provider_account_id = :providerAccountId", {
				userId,
				providerAccountId,
			})
			.execute();
	}

	async deleteByAccountFromTimestamp(
		userId: number,
		providerAccountId: number,
		fromTimestamp: DateTime
	): Promise<void> {
		await this.dataSource
			.getRepository(AssetHoldingEntity)
			.createQueryBuilder()
			.delete()
			.where("user_id = :userId AND provider_account_id = :providerAccountId", {
				userId,
				providerAccountId,
			})
			.andWhere("timestamp >= :timestamp", { timestamp: fromTimestamp.toMillis() })
			.execute();
	}

	async findDistinctTimestamps(
		userId: number,
		providerAccountId?: number
	): Promise<DateTime[]> {
		let query = this.dataSource
			.getRepository(AssetHoldingEntity)
			.createQueryBuilder("holding")
			.select("DISTINCT holding.timestamp", "timestamp")
			.where("holding.userId = :userId", { userId });

		if (providerAccountId) {
			query = query.andWhere("holding.providerAccountId = :providerAccountId", {
				providerAccountId,
			});
		}

		const results = await query.orderBy("holding.timestamp", "ASC").getRawMany();

		return results.map((r: any) => DateTime.fromMillis(Number(r.timestamp), { zone: "utc" }));
	}
}
