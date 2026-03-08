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

	async getPriceForDate(asset: string, date: DateTime): Promise<AssetPriceEntity | null> {
		const dayEnd = date.endOf("day").toMillis();
		
		const results = await this.dataSource.query(`
			SELECT * FROM asset_prices 
			WHERE asset = ? AND fetched_at <= ?
			ORDER BY fetched_at DESC
			LIMIT 1
		`, [asset.toUpperCase(), dayEnd]);

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
		const results = await this.dataSource.query(`
			SELECT DATE(fetched_at / 86400000) as day_num, 
				   MAX(fetched_at) as fetched_at,
				   price_eur
			FROM asset_prices
			WHERE asset = ? 
			AND fetched_at >= ? 
			AND fetched_at <= ?
			GROUP BY day_num
			ORDER BY fetched_at ASC
		`, [asset.toUpperCase(), startDate.toMillis(), endDate.toMillis()]);

		return results.map((row: any) => ({
			date: DateTime.fromMillis(Number(row.fetched_at)).startOf("day"),
			priceEur: Number(row.price_eur),
		}));
	}
}
