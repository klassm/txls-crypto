import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableIndex } from "typeorm";

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("asset_prices", true, true, true).catch(() => {});
    await queryRunner.dropTable("coingecko_ids", true, true, true).catch(() => {});
    await queryRunner.dropTable("portfolio_snapshots", true, true, true).catch(() => {});
    await queryRunner.dropTable("transactions", true, true, true).catch(() => {});
    await queryRunner.dropTable("provider_accounts", true, true, true).catch(() => {});
    await queryRunner.dropTable("users", true, true, true).catch(() => {});

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
            default: 0,
          },
          {
            name: "updated_at",
            type: "bigint",
            default: 0,
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
            default: 0,
          },
          {
            name: "updated_at",
            type: "bigint",
            default: 0,
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
            type: "bigint",
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
            name: "eur_rate",
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
            default: 0,
          },
          {
            name: "updated_at",
            type: "bigint",
            default: 0,
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

    await queryRunner.createTable(
      new Table({
        name: "portfolio_snapshots",
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
            name: "asset",
            type: "varchar",
          },
          {
            name: "date",
            type: "bigint",
          },
          {
            name: "amount",
            type: "decimal",
            precision: 18,
            scale: 8,
          },
          {
            name: "eur_invested",
            type: "decimal",
            precision: 18,
            scale: 8,
          },
          {
            name: "buy_count",
            type: "integer",
            default: 0,
          },
          {
            name: "sell_count",
            type: "integer",
            default: 0,
          },
          {
            name: "created_at",
            type: "bigint",
            default: 0,
          },
          {
            name: "updated_at",
            type: "bigint",
            default: 0,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "portfolio_snapshots",
      new TableIndex({
        name: "idx_portfolio_snapshot_lookup",
        columnNames: ["user_id", "provider_account_id", "asset", "date"],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      "portfolio_snapshots",
      new TableIndex({
        name: "idx_portfolio_snapshot_account_date",
        columnNames: ["user_id", "provider_account_id", "date"],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "coingecko_ids",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "symbol",
            type: "varchar",
            length: "20",
          },
          {
            name: "coingecko_id",
            type: "varchar",
            length: "100",
          },
          {
            name: "name",
            type: "varchar",
            length: "200",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
          },
          {
            name: "created_at",
            type: "bigint",
            default: 0,
          },
          {
            name: "updated_at",
            type: "bigint",
            default: 0,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "coingecko_ids",
      new TableIndex({
        name: "idx_coingecko_ids_symbol",
        columnNames: ["symbol"],
        isUnique: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "asset_prices",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "asset",
            type: "varchar",
            length: "20",
          },
          {
            name: "price_eur",
            type: "decimal",
            precision: 18,
            scale: 8,
          },
          {
            name: "fetched_at",
            type: "bigint",
          },
          {
            name: "source",
            type: "varchar",
            length: "50",
            default: "'coingecko'",
          },
          {
            name: "created_at",
            type: "bigint",
            default: 0,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "asset_prices",
      new TableIndex({
        name: "idx_asset_prices_asset_fetched",
        columnNames: ["asset", "fetched_at"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("asset_prices");
    await queryRunner.dropTable("coingecko_ids");
    await queryRunner.dropTable("portfolio_snapshots");
    await queryRunner.dropTable("transactions");
    await queryRunner.dropTable("provider_accounts");
    await queryRunner.dropTable("users");
  }
}
