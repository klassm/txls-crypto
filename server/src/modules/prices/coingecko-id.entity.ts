import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	Index,
} from "typeorm";
import { DateTime } from "luxon";
import { typeOrmDateTimeTransformer } from "../../utils/typeorm-transformers.js";

@Entity("coingecko_ids")
@Index("idx_coingecko_ids_symbol", ["symbol"], { unique: true })
export class CoinGeckoIdEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: "varchar", length: 20 })
	symbol!: string;

	@Column({ name: "coingecko_id", type: "varchar", length: 100 })
	coinGeckoId!: string;

	@Column({ type: "varchar", length: 200, nullable: true })
	name!: string | null;

	@Column({ name: "is_active", type: "boolean", default: true })
	isActive!: boolean;

	@CreateDateColumn({
		name: "created_at",
		type: "bigint",
		transformer: typeOrmDateTimeTransformer,
	})
	createdAt!: DateTime;

	@UpdateDateColumn({
		name: "updated_at",
		type: "bigint",
		transformer: typeOrmDateTimeTransformer,
	})
	updatedAt!: DateTime;
}
