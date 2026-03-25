import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddEurRateColumn1741593600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("transactions");
    if (table && !table.findColumnByName("eur_rate")) {
      await queryRunner.query(`
        ALTER TABLE transactions 
        ADD COLUMN eur_rate decimal(18,8) NOT NULL DEFAULT 0
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("transactions");
    if (table && table.findColumnByName("eur_rate")) {
      await queryRunner.query(`
        ALTER TABLE transactions 
        DROP COLUMN eur_rate
      `);
    }
  }
}
