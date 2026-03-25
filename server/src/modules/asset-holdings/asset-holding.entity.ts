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

@Entity("asset_holdings")
@Index("idx_asset_holdings_lookup", ["userId", "providerAccountId", "asset", "timestamp"], { unique: true })
@Index("idx_asset_holdings_account_timestamp", ["userId", "providerAccountId", "timestamp"])
@Index("idx_asset_holdings_user_timestamp", ["userId", "timestamp"])
export class AssetHoldingEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ name: "user_id", type: "int" })
	userId!: number;

	@Column({ name: "provider_account_id", type: "int" })
	providerAccountId!: number;

	@Column({ type: "varchar" })
	asset!: string;

	@Column({ type: "decimal", precision: 18, scale: 8 })
	amount!: number;

	@Column({ name: "eur_invested", type: "decimal", precision: 18, scale: 8 })
	eurInvested!: number;

	@Column({ type: "bigint", transformer: typeOrmDateTimeTransformer })
	timestamp!: DateTime;

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
