import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { PricesRepository } from "./prices.repository.js";
import { AssetPriceEntity } from "./asset-price.entity.js";

export interface AssetPrice {
	asset: string;
	priceEur: number;
	fetchedAt: DateTime;
	source: string;
}

export class PricesService {
	private repository: PricesRepository;

	constructor(private dataSource: DataSource) {
		this.repository = new PricesRepository(dataSource);
	}

	async getLatestPrice(asset: string): Promise<AssetPrice | null> {
		const entity = await this.repository.getLatestPrice(asset);
		if (!entity) return null;

		return this.toAssetPrice(entity);
	}

	async getLatestPrices(assets: string[]): Promise<Map<string, AssetPrice>> {
		const entities = await this.repository.getLatestPrices(assets);
		const result = new Map<string, AssetPrice>();

		for (const [asset, entity] of entities) {
			result.set(asset, this.toAssetPrice(entity));
		}

		return result;
	}

	async getAllLatestPrices(): Promise<Map<string, AssetPrice>> {
		const entities = await this.repository.getAllLatestPrices();
		const result = new Map<string, AssetPrice>();

		for (const [asset, entity] of entities) {
			result.set(asset, this.toAssetPrice(entity));
		}

		return result;
	}

	async getPricesInTimeRange(
		asset: string,
		startTime: DateTime,
		endTime: DateTime
	): Promise<AssetPrice[]> {
		const entities = await this.repository.getPricesInTimeRange(asset, startTime, endTime);
		return entities.map(e => this.toAssetPrice(e));
	}

	async savePriceFromTransaction(asset: string, priceEur: number, date: DateTime): Promise<void> {
		await this.repository.savePriceFromTransaction(asset, priceEur, date);
	}

	async getPriceForDate(asset: string, date: DateTime): Promise<AssetPrice | null> {
		const entity = await this.repository.getPriceForDate(asset, date);
		if (!entity) return null;
		return this.toAssetPrice(entity);
	}

	private toAssetPrice(entity: AssetPriceEntity): AssetPrice {
		return {
			asset: entity.asset,
			priceEur: Number(entity.priceEur),
			fetchedAt: entity.fetchedAt,
			source: entity.source,
		};
	}
}
