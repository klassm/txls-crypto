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

@Entity("transactions")
@Index("idx_provider_account_timestamp", ["providerAccountId", "timestamp"])
@Index("idx_provider_account_type", ["providerAccountId", "type"])
@Index("idx_provider_account_type_timestamp", ["providerAccountId", "type", "timestamp"])
@Index("idx_provider_account_asset", ["providerAccountId", "asset"])
export class TransactionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Column({ name: "provider_account_id", type: "int" })
  providerAccountId!: number;

  @Column({ name: "external_id", type: "varchar", unique: true })
  externalId!: string;

  @Column({ type: "bigint", transformer: typeOrmDateTimeTransformer })
  timestamp!: DateTime;

  @Column({ type: "varchar" })
  type!: string;

  @Column({ type: "varchar" })
  asset!: string;

  @Column({ type: "decimal", precision: 18, scale: 8 })
  quantity!: number;

  @Column({ name: "eur_value", type: "decimal", precision: 18, scale: 8 })
  eurValue!: number;

  @Column({ name: "eur_fee", type: "decimal", precision: 18, scale: 8 })
  eurFee!: number;

  @Column({ type: "boolean", default: false })
  processed!: boolean;

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