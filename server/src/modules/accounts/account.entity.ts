import {Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,} from "typeorm";
import {DateTime} from "luxon";
import {ProviderType} from "@txls/shared";
import {typeOrmDateTimeTransformer} from "../../utils/typeorm-transformers.js";

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

  @Column({
    type: "boolean",
    name: "api_enabled",
    default: false,
  })
  apiEnabled!: boolean;

  @Column({
    type: "text",
    name: "api_key_encrypted",
    nullable: true,
  })
  apiKeyEncrypted!: string | null;

  @Column({
    type: "bigint",
    name: "last_sync_at",
    nullable: true,
    transformer: typeOrmDateTimeTransformer,
  })
  lastSyncAt!: DateTime | null;

  @Column({
    type: "text",
    name: "sync_error",
    nullable: true,
  })
  syncError!: string | null;

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