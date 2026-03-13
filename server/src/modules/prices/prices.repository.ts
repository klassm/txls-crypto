import "reflect-metadata";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { DateTime } from "luxon";
import { AssetPriceEntity } from "./asset-price.entity.js";
import type { CoinPrice } from "./coingecko.service.js";

export class PricesRepository {
	constructor(private dataSource: DataSource) {}

	private get qb(): SelectQueryBuilder<AssetPriceEntity> {
		return this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("price");
	}

	async savePrices(prices: CoinPrice[]): Promise<void> {
		if (prices.length === 0) return;

		const entities = prices.map(p => ({
			asset: p.symbol,
			priceEur: p.priceEur,
			fetchedAt: p.fetchedAt,
			source: "coingecko",
			createdAt: DateTime.utc(),
		}));

		await this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder()
			.insert()
			.into(AssetPriceEntity)
			.values(entities)
			.execute();
	}

	async savePriceFromTransaction(asset: string, priceEur: number, date: DateTime): Promise<void> {
		const entity = {
			asset: asset.toUpperCase(),
			priceEur,
			fetchedAt: date,
			source: "transaction",
			createdAt: DateTime.utc(),
		};

		await this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder()
			.insert()
			.into(AssetPriceEntity)
			.values(entity)
			.orIgnore()
			.execute();
	}

	async getLatestPrice(asset: string): Promise<AssetPriceEntity | null> {
		return this.qb
			.where("price.asset = :asset", { asset: asset.toUpperCase() })
			.orderBy("price.fetchedAt", "DESC")
			.limit(1)
			.getOne();
	}

	async getLatestPrices(assets: string[]): Promise<Map<string, AssetPriceEntity>> {
		if (assets.length === 0) return new Map();

		const normalizedAssets = assets.map(a => a.toUpperCase());
		const results = await this.dataSource.query(`
			SELECT p1.*
			FROM asset_prices p1
			INNER JOIN (
				SELECT asset, MAX(fetched_at) as max_fetched
				FROM asset_prices
				WHERE asset IN (${normalizedAssets.map(() => "?").join(",")})
				GROUP BY asset
			) p2 ON p1.asset = p2.asset AND p1.fetched_at = p2.max_fetched
		`, normalizedAssets);

		const map = new Map<string, AssetPriceEntity>();
		for (const row of results) {
			const entity = new AssetPriceEntity();
			entity.id = row.id;
			entity.asset = row.asset;
			entity.priceEur = Number(row.price_eur);
			entity.fetchedAt = DateTime.fromMillis(Number(row.fetched_at));
			entity.source = row.source;
			entity.createdAt = DateTime.fromMillis(Number(row.created_at));
			map.set(entity.asset, entity);
		}

		return map;
	}

	async getAllLatestPrices(): Promise<Map<string, AssetPriceEntity>> {
		const results = await this.dataSource.query(`
			SELECT p1.*
			FROM asset_prices p1
			INNER JOIN (
				SELECT asset, MAX(fetched_at) as max_fetched
				FROM asset_prices
				GROUP BY asset
			) p2 ON p1.asset = p2.asset AND p1.fetched_at = p2.max_fetched
		`);

		const map = new Map<string, AssetPriceEntity>();
		for (const row of results) {
			const entity = new AssetPriceEntity();
			entity.id = row.id;
			entity.asset = row.asset;
			entity.priceEur = Number(row.price_eur);
			entity.fetchedAt = DateTime.fromMillis(Number(row.fetched_at));
			entity.source = row.source;
			entity.createdAt = DateTime.fromMillis(Number(row.created_at));
			map.set(entity.asset, entity);
		}

		return map;
	}

	async getPricesInTimeRange(
		asset: string,
		startTime: DateTime,
		endTime: DateTime
	): Promise<AssetPriceEntity[]> {
		return this.qb
			.where("price.asset = :asset", { asset: asset.toUpperCase() })
			.andWhere("price.fetchedAt >= :startTime", { startTime: startTime.toMillis() })
			.andWhere("price.fetchedAt <= :endTime", { endTime: endTime.toMillis() })
			.orderBy("price.fetchedAt", "ASC")
			.getMany();
	}

	async deleteOldPrices(olderThanDays: number): Promise<number> {
		const cutoffDate = DateTime.utc().minus({ days: olderThanDays });
		const result = await this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder()
			.delete()
			.where("fetched_at < :cutoffDate", { cutoffDate: cutoffDate.toMillis() })
			.execute();

		return result.affected || 0;
	}

	async getPriceForDate(asset: string, date: DateTime, maxAgeDays = 7): Promise<AssetPriceEntity | null> {
		const dayEnd = date.endOf("day").toMillis();
		const minFetchTime = date.minus({ days: maxAgeDays }).startOf("day").toMillis();
		
		const results = await this.dataSource.query(`
			SELECT * FROM asset_prices 
			WHERE asset = ? AND fetched_at <= ? AND fetched_at >= ?
			ORDER BY fetched_at DESC
			LIMIT 1
		`, [asset.toUpperCase(), dayEnd, minFetchTime]);

		if (results.length === 0) return null;

		const row = results[0];
		const entity = new AssetPriceEntity();
		entity.id = row.id;
		entity.asset = row.asset;
		entity.priceEur = Number(row.price_eur);
		entity.fetchedAt = DateTime.fromMillis(Number(row.fetched_at));
		entity.source = row.source;
		entity.createdAt = DateTime.fromMillis(Number(row.created_at));
		return entity;
	}

	async getPricesForDate(assets: string[], date: DateTime): Promise<Map<string, AssetPriceEntity>> {
		if (assets.length === 0) return new Map();

		const dayEnd = date.endOf("day").toMillis();
		const normalizedAssets = assets.map(a => a.toUpperCase());

		const results = await this.dataSource.query(`
			SELECT p1.*
			FROM asset_prices p1
			INNER JOIN (
				SELECT asset, MAX(fetched_at) as max_fetched
				FROM asset_prices
				WHERE asset IN (${normalizedAssets.map(() => "?").join(",")}) 
				AND fetched_at <= ?
				GROUP BY asset
			) p2 ON p1.asset = p2.asset AND p1.fetched_at = p2.max_fetched
		`, [...normalizedAssets, dayEnd]);

		const map = new Map<string, AssetPriceEntity>();
		for (const row of results) {
			const entity = new AssetPriceEntity();
			entity.id = row.id;
			entity.asset = row.asset;
			entity.priceEur = Number(row.price_eur);
			entity.fetchedAt = DateTime.fromMillis(Number(row.fetched_at));
			entity.source = row.source;
			entity.createdAt = DateTime.fromMillis(Number(row.created_at));
			map.set(entity.asset, entity);
		}

		return map;
	}

	async getPriceHistory(
		asset: string,
		startDate: DateTime,
		endDate: DateTime
	): Promise<{ date: DateTime; priceEur: number }[]> {
		const start = startDate.toMillis();
		const end = endDate.toMillis();
		
		const results = await this.qb
			.where("price.asset = :asset", { asset: asset.toUpperCase() })
			.andWhere("price.fetchedAt >= :start", { start })
			.andWhere("price.fetchedAt <= :end", { end })
			.orderBy("price.fetchedAt", "ASC")
			.getMany();

		const byDay = new Map<string, { date: DateTime; priceEur: number }>();
		for (const result of results) {
			const dayKey = result.fetchedAt.startOf("day").toISODate() || "";
			if (!byDay.has(dayKey)) {
				byDay.set(dayKey, {
					date: result.fetchedAt.startOf("day"),
					priceEur: Number(result.priceEur),
				});
			}
		}

		return Array.from(byDay.values());
	}

	async getPriceHistoryBatch(
		assets: string[],
		startDate: DateTime,
		endDate: DateTime
	): Promise<Map<string, { date: DateTime; priceEur: number }[]>> {
		if (assets.length === 0) return new Map();

		const start = startDate.toMillis();
		const end = endDate.toMillis();
		const normalizedAssets = assets.map(a => a.toUpperCase());

		const results = await this.qb
			.where("price.asset IN (:...assets)", { assets: normalizedAssets })
			.andWhere("price.fetchedAt >= :start", { start })
			.andWhere("price.fetchedAt <= :end", { end })
			.orderBy("price.fetchedAt", "DESC")
			.getMany();

		const byAsset = new Map<string, Map<string, { date: DateTime; priceEur: number }>>();
		
		for (const asset of normalizedAssets) {
			byAsset.set(asset, new Map());
		}

		for (const result of results) {
			const asset = result.asset;
			const date = result.fetchedAt.startOf("day");
			const dayKey = date.toISODate() || "";
			
			const assetMap = byAsset.get(asset);
			if (assetMap && !assetMap.has(dayKey)) {
				assetMap.set(dayKey, {
					date,
					priceEur: Number(result.priceEur),
				});
			}
		}

		const result = new Map<string, { date: DateTime; priceEur: number }[]>();
		for (const [asset, dayMap] of byAsset) {
			const prices = Array.from(dayMap.values());
			prices.sort((a, b) => a.date.toMillis() - b.date.toMillis());
			result.set(asset, prices);
		}

		return result;
	}
}
