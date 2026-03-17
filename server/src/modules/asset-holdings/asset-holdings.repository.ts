import "reflect-metadata";
import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
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

export class AssetHoldingsRepository {
	constructor(private dataSource: DataSource) {}

	async findLatestByAccount(
		userId: number,
		providerAccountId: number
	): Promise<Map<string, HoldingState>> {
		const results = await this.dataSource.query(`
			SELECT ah.*
			FROM asset_holdings ah
			INNER JOIN (
				SELECT asset, MAX(timestamp) as max_timestamp
				FROM asset_holdings
				WHERE user_id = ? AND provider_account_id = ?
				GROUP BY asset
			) latest ON ah.asset = latest.asset AND ah.timestamp = latest.max_timestamp
			WHERE ah.user_id = ? AND ah.provider_account_id = ?
		`, [userId, providerAccountId, userId, providerAccountId]);

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
		const results = await this.dataSource.query(`
			SELECT ah.*
			FROM asset_holdings ah
			INNER JOIN (
				SELECT provider_account_id, asset, MAX(timestamp) as max_timestamp
				FROM asset_holdings
				WHERE user_id = ?
				GROUP BY provider_account_id, asset
			) latest ON ah.provider_account_id = latest.provider_account_id 
				AND ah.asset = latest.asset 
				AND ah.timestamp = latest.max_timestamp
			WHERE ah.user_id = ?
		`, [userId, userId]);

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
		const results = await this.dataSource.query(`
			SELECT ah.*
			FROM asset_holdings ah
			INNER JOIN (
				SELECT asset, MAX(timestamp) as max_timestamp
				FROM asset_holdings
				WHERE user_id = ? AND provider_account_id = ? AND timestamp <= ?
				GROUP BY asset
			) latest ON ah.asset = latest.asset AND ah.timestamp = latest.max_timestamp
			WHERE ah.user_id = ? AND ah.provider_account_id = ?
		`, [userId, providerAccountId, ts, userId, providerAccountId]);

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
		const results = await this.dataSource.query(`
			SELECT ah.*
			FROM asset_holdings ah
			INNER JOIN (
				SELECT provider_account_id, asset, MAX(timestamp) as max_timestamp
				FROM asset_holdings
				WHERE user_id = ? AND timestamp <= ?
				GROUP BY provider_account_id, asset
			) latest ON ah.provider_account_id = latest.provider_account_id 
				AND ah.asset = latest.asset 
				AND ah.timestamp = latest.max_timestamp
			WHERE ah.user_id = ?
		`, [userId, ts, userId]);

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

		return results.map((r: any) => DateTime.fromMillis(Number(r.timestamp)));
	}
}
