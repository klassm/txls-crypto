import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableIndex } from "typeorm";

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "name",
            type: "varchar",
          },
          {
            name: "username",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "password",
            type: "varchar",
          },
          {
            name: "salt",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "email",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "is_admin",
            type: "boolean",
            default: false,
          },
          {
            name: "created_at",
            type: "bigint",
          },
          {
            name: "updated_at",
            type: "bigint",
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: "provider_accounts",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "user_id",
            type: "integer",
          },
          {
            name: "provider",
            type: "varchar",
          },
          {
            name: "created_at",
            type: "bigint",
          },
          {
            name: "updated_at",
            type: "bigint",
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: "transactions",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "user_id",
            type: "integer",
          },
          {
            name: "provider_account_id",
            type: "integer",
          },
          {
            name: "external_id",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "timestamp",
            type: "integer",
          },
          {
            name: "type",
            type: "varchar",
          },
          {
            name: "asset",
            type: "varchar",
          },
          {
            name: "quantity",
            type: "decimal",
            precision: 18,
            scale: 8,
          },
          {
            name: "eur_value",
            type: "decimal",
            precision: 18,
            scale: 8,
          },
          {
            name: "eur_fee",
            type: "decimal",
            precision: 18,
            scale: 8,
            default: 0,
          },
          {
            name: "processed",
            type: "boolean",
            default: false,
          },
          {
            name: "created_at",
            type: "bigint",
          },
          {
            name: "updated_at",
            type: "bigint",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "transactions",
      new TableIndex({
        name: "idx_provider_account_timestamp",
        columnNames: ["provider_account_id", "timestamp"],
      }),
    );

    await queryRunner.createIndex(
      "transactions",
      new TableIndex({
        name: "idx_provider_account_type",
        columnNames: ["provider_account_id", "type"],
      }),
    );

    await queryRunner.createIndex(
      "transactions",
      new TableIndex({
        name: "idx_provider_account_type_timestamp",
        columnNames: ["provider_account_id", "type", "timestamp"],
      }),
    );

    await queryRunner.createIndex(
      "transactions",
      new TableIndex({
        name: "idx_provider_account_asset",
        columnNames: ["provider_account_id", "asset"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("transactions");
    await queryRunner.dropTable("provider_accounts");
    await queryRunner.dropTable("users");
  }
}
