import "reflect-metadata";
import { injectable, inject } from "inversify";
import type { DataSource } from "typeorm";
import { TYPES } from "../../di/types.js";
import { CoinGeckoIdEntity } from "./coingecko-id.entity.js";

@injectable()
export class CoinGeckoRepository {
	constructor(@inject(TYPES.DataSource) private dataSource: DataSource) {}

	async findActiveMappings(): Promise<CoinGeckoIdEntity[]> {
		return this.dataSource
			.getRepository(CoinGeckoIdEntity)
			.createQueryBuilder("mapping")
			.where("mapping.isActive = :isActive", { isActive: true })
			.getMany();
	}

	async upsertMapping(
		symbol: string,
		coinGeckoId: string,
		name: string
	): Promise<void> {
		await this.dataSource
			.getRepository(CoinGeckoIdEntity)
			.createQueryBuilder()
			.insert()
			.into(CoinGeckoIdEntity)
			.values({
				symbol,
				coinGeckoId,
				name,
				isActive: true,
			})
			.orUpdate(["coingecko_id", "name", "updated_at"], ["symbol"])
			.execute();
	}
}
