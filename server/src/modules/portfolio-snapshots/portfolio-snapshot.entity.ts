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

@Entity("portfolio_snapshots")
@Index("idx_portfolio_snapshot_lookup", ["userId", "providerAccountId", "asset", "date"], { unique: true })
@Index("idx_portfolio_snapshot_account_date", ["userId", "providerAccountId", "date"])
export class PortfolioSnapshotEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ name: "user_id", type: "int" })
	userId!: number;

	@Column({ name: "provider_account_id", type: "int" })
	providerAccountId!: number;

	@Column({ type: "varchar" })
	asset!: string;

	@Column({ type: "bigint", transformer: typeOrmDateTimeTransformer })
	date!: DateTime;

	@Column({ type: "decimal", precision: 18, scale: 8 })
	amount!: number;

	@Column({ name: "eur_invested", type: "decimal", precision: 18, scale: 8 })
	eurInvested!: number;

	@Column({ name: "buy_count", type: "int", default: 0 })
	buyCount!: number;

	@Column({ name: "sell_count", type: "int", default: 0 })
	sellCount!: number;

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
