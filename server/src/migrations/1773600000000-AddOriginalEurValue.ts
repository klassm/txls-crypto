import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOriginalEurValue1773600000000 implements MigrationInterface {
  name = "AddOriginalEurValue1773600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions ADD COLUMN original_eur_value DECIMAL(20, 8) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions DROP COLUMN original_eur_value
    `);
  }
}
