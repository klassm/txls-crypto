import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	Index,
} from "typeorm";
import { DateTime } from "luxon";
import { typeOrmDateTimeTransformer } from "../../utils/typeorm-transformers.js";

@Entity("asset_prices")
@Index("idx_asset_prices_asset_fetched", ["asset", "fetchedAt"])
export class AssetPriceEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: "varchar", length: 20 })
	asset!: string;

	@Column({ name: "price_eur", type: "decimal", precision: 18, scale: 8 })
	priceEur!: number;

	@Column({ name: "fetched_at", type: "bigint", transformer: typeOrmDateTimeTransformer })
	fetchedAt!: DateTime;

	@Column({ type: "varchar", length: 50, default: "coingecko" })
	source!: string;

	@CreateDateColumn({
		name: "created_at",
		type: "bigint",
		transformer: typeOrmDateTimeTransformer,
	})
	createdAt!: DateTime;
}
