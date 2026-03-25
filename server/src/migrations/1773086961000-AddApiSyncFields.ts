import type { MigrationInterface, QueryRunner } from "typeorm";
import { TableColumn } from "typeorm";

export class AddApiSyncFields1773086961000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "provider_accounts",
      new TableColumn({
        name: "api_enabled",
        type: "boolean",
        default: false,
      }),
    );

    await queryRunner.addColumn(
      "provider_accounts",
      new TableColumn({
        name: "api_key_encrypted",
        type: "text",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "provider_accounts",
      new TableColumn({
        name: "last_sync_at",
        type: "bigint",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "provider_accounts",
      new TableColumn({
        name: "sync_error",
        type: "text",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("provider_accounts", "sync_error");
    await queryRunner.dropColumn("provider_accounts", "last_sync_at");
    await queryRunner.dropColumn("provider_accounts", "api_key_encrypted");
    await queryRunner.dropColumn("provider_accounts", "api_enabled");
  }
}
