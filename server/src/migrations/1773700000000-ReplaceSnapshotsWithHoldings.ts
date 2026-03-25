import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableIndex } from "typeorm";

export class ReplaceSnapshotsWithHoldings1773700000000 implements MigrationInterface {
  name = "ReplaceSnapshotsWithHoldings1773700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("portfolio_snapshots", true, true, true).catch(() => {});

    await queryRunner.createTable(
      new Table({
        name: "asset_holdings",
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
            name: "timestamp",
            type: "bigint",
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
      "asset_holdings",
      new TableIndex({
        name: "idx_asset_holdings_lookup",
        columnNames: ["user_id", "provider_account_id", "asset", "timestamp"],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      "asset_holdings",
      new TableIndex({
        name: "idx_asset_holdings_account_timestamp",
        columnNames: ["user_id", "provider_account_id", "timestamp"],
      }),
    );

    await queryRunner.createIndex(
      "asset_holdings",
      new TableIndex({
        name: "idx_asset_holdings_user_timestamp",
        columnNames: ["user_id", "timestamp"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("asset_holdings");

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
  }
}
