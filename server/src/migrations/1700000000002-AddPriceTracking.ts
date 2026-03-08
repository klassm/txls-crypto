import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableIndex } from "typeorm";

export class AddPriceTracking1700000000002 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
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
	}
}
