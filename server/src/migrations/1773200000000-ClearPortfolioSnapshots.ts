import type { MigrationInterface, QueryRunner } from "typeorm";

export class ClearPortfolioSnapshots1773200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM portfolio_snapshots");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }
}
