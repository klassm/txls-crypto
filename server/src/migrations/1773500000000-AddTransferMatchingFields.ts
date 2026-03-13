import type { MigrationInterface, QueryRunner } from "typeorm";
import { TableColumn } from "typeorm";

export class AddTransferMatchingFields1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "transactions",
      new TableColumn({
        name: "linked_transaction_id",
        type: "integer",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "transactions",
      new TableColumn({
        name: "original_acquisition_timestamp",
        type: "bigint",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("transactions", "original_acquisition_timestamp");
    await queryRunner.dropColumn("transactions", "linked_transaction_id");
  }
}
