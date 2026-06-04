import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { DataSource, SelectQueryBuilder } from "typeorm";
import { DateTime } from "luxon";
import { TYPES } from "../../di/types.js";
import { AssetPriceEntity } from "./asset-price.entity.js";
import type { CoinPrice } from "./coingecko.service.js";

@injectable()
export class PricesRepository {
	constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

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

		const maxFetchedSubquery = this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("sub")
			.select("sub.asset", "asset")
			.addSelect("MAX(sub.fetchedAt)", "max_fetched")
			.where("sub.asset IN (:...assets)", { assets: normalizedAssets })
			.groupBy("sub.asset");

		const results = await this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("p1")
			.innerJoin(
				`(${maxFetchedSubquery.getQuery()})`,
				"p2",
				"p1.asset = p2.asset AND p1.fetchedAt = p2.max_fetched"
			)
			.setParameters(maxFetchedSubquery.getParameters())
			.getMany();

		const map = new Map<string, AssetPriceEntity>();
		for (const entity of results) {
			map.set(entity.asset, entity);
		}

		return map;
	}

	async getAllLatestPrices(): Promise<Map<string, AssetPriceEntity>> {
		const maxFetchedSubquery = this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("sub")
			.select("sub.asset", "asset")
			.addSelect("MAX(sub.fetchedAt)", "max_fetched")
			.groupBy("sub.asset");

		const results = await this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("p1")
			.innerJoin(
				`(${maxFetchedSubquery.getQuery()})`,
				"p2",
				"p1.asset = p2.asset AND p1.fetchedAt = p2.max_fetched"
			)
			.getMany();

		const map = new Map<string, AssetPriceEntity>();
		for (const entity of results) {
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
		const dayStart = date.startOf("day").toMillis();
		const dayEnd = date.endOf("day").toMillis();

		return this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("price")
			.where("price.asset = :asset", { asset: asset.toUpperCase() })
			.andWhere("price.fetchedAt >= :dayStart", { dayStart })
			.andWhere("price.fetchedAt <= :dayEnd", { dayEnd })
			.orderBy("price.fetchedAt", "DESC")
			.limit(1)
			.getOne();
	}

	async getPricesForDate(assets: string[], date: DateTime): Promise<Map<string, AssetPriceEntity>> {
		if (assets.length === 0) return new Map();

		const dayEnd = date.endOf("day").toMillis();
		const normalizedAssets = assets.map(a => a.toUpperCase());

		const maxFetchedSubquery = this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("sub")
			.select("sub.asset", "asset")
			.addSelect("MAX(sub.fetchedAt)", "max_fetched")
			.where("sub.asset IN (:...assets)", { assets: normalizedAssets })
			.andWhere("sub.fetchedAt <= :dayEnd", { dayEnd })
			.groupBy("sub.asset");

		const results = await this.dataSource
			.getRepository(AssetPriceEntity)
			.createQueryBuilder("p1")
			.innerJoin(
				`(${maxFetchedSubquery.getQuery()})`,
				"p2",
				"p1.asset = p2.asset AND p1.fetchedAt = p2.max_fetched"
			)
			.setParameters(maxFetchedSubquery.getParameters())
			.getMany();

		const map = new Map<string, AssetPriceEntity>();
		for (const entity of results) {
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

		if (results.length === 0) return [];

		const days = endDate.diff(startDate, "days").days;

		if (days <= 1) {
			return this.aggregateByFiveMinutes(results);
		}

		if (days < 31) {
			return this.aggregateByHour(results);
		}

		return this.aggregateByDay(results);
	}

	private aggregateByHour(
		prices: AssetPriceEntity[]
	): { date: DateTime; priceEur: number }[] {
		const groups = new Map<string, { sum: number; count: number; date: DateTime }>();

		for (const price of prices) {
			const hourStart = price.fetchedAt.startOf("hour");
			const key = hourStart.toISO() || "";

			const existing = groups.get(key);
			if (existing) {
				existing.sum += Number(price.priceEur);
				existing.count++;
			} else {
				groups.set(key, {
					sum: Number(price.priceEur),
					count: 1,
					date: hourStart,
				});
			}
		}

		const result = Array.from(groups.values()).map((g) => ({
			date: g.date,
			priceEur: g.sum / g.count,
		}));

		result.sort((a, b) => a.date.toMillis() - b.date.toMillis());
		return result;
	}

	private aggregateByFiveMinutes(
		prices: AssetPriceEntity[]
	): { date: DateTime; priceEur: number }[] {
		const groups = new Map<string, { sum: number; count: number; date: DateTime }>();

		for (const price of prices) {
			const timestamp = price.fetchedAt;
			const minutes = timestamp.minute;
			const roundedMinutes = Math.floor(minutes / 5) * 5;
			const fiveMinStart = timestamp.set({ minute: roundedMinutes, second: 0, millisecond: 0 });
			const key = fiveMinStart.toISO() || "";

			const existing = groups.get(key);
			if (existing) {
				existing.sum += Number(price.priceEur);
				existing.count++;
			} else {
				groups.set(key, {
					sum: Number(price.priceEur),
					count: 1,
					date: fiveMinStart,
				});
			}
		}

		const result = Array.from(groups.values()).map((g) => ({
			date: g.date,
			priceEur: g.sum / g.count,
		}));

		result.sort((a, b) => a.date.toMillis() - b.date.toMillis());
		return result;
	}

	private aggregateByDay(
		prices: AssetPriceEntity[]
	): { date: DateTime; priceEur: number }[] {
		const groups = new Map<string, { sum: number; count: number; date: DateTime }>();

		for (const price of prices) {
			const dayStart = price.fetchedAt.startOf("day");
			const key = dayStart.toISODate() || "";

			const existing = groups.get(key);
			if (existing) {
				existing.sum += Number(price.priceEur);
				existing.count++;
			} else {
				groups.set(key, {
					sum: Number(price.priceEur),
					count: 1,
					date: dayStart,
				});
			}
		}

		const result = Array.from(groups.values()).map((g) => ({
			date: g.date,
			priceEur: g.sum / g.count,
		}));

		result.sort((a, b) => a.date.toMillis() - b.date.toMillis());
		return result;
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

	async getPriceAtOrBefore(
		asset: string,
		targetTime: DateTime
	): Promise<{ date: DateTime; priceEur: number } | null> {
		const result = await this.qb
			.where("price.asset = :asset", { asset: asset.toUpperCase() })
			.andWhere("price.fetchedAt <= :targetTime", { targetTime: targetTime.toMillis() })
			.orderBy("price.fetchedAt", "DESC")
			.limit(1)
			.getOne();

		if (!result) return null;

		return {
			date: result.fetchedAt,
			priceEur: Number(result.priceEur),
		};
	}

	async getPriceAtOrBeforeWithTolerance(
		asset: string,
		targetTime: DateTime,
		toleranceHours: number
	): Promise<{ date: DateTime; priceEur: number } | null> {
		const result = await this.getPriceAtOrBefore(asset, targetTime);
		if (!result) return null;

		const toleranceMs = toleranceHours * 60 * 60 * 1000;
		const distanceFromTarget = Math.abs(targetTime.toMillis() - result.date.toMillis());
		
		if (distanceFromTarget > toleranceMs) return null;

		return result;
	}
}
