import {Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,} from "typeorm";
import {DateTime} from "luxon";
import {ProviderType} from "../../../types/index.js";
import {typeOrmDateTimeTransformer} from "../../../utils/typeorm-transformers.js";

@Entity("provider_accounts")
export class AccountEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "integer", name: "user_id" })
  userId!: number;

  @Column({
    type: "varchar",
    enum: Object.values(ProviderType),
    name: "provider",
  })
  provider!: ProviderType;

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