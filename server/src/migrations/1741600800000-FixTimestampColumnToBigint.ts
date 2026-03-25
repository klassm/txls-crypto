import type { MigrationInterface, QueryRunner } from "typeorm";

export class FixTimestampColumnToBigint1741600800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("transactions");
    if (!table) return;

    const timestampColumn = table.findColumnByName("timestamp");
    if (!timestampColumn) return;

    const isMysql = queryRunner.connection.options.type === "mysql";
    
    if (isMysql && timestampColumn.type !== "bigint") {
      await queryRunner.query(`
        ALTER TABLE transactions 
        MODIFY COLUMN timestamp BIGINT NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("transactions");
    if (!table) return;

    const timestampColumn = table.findColumnByName("timestamp");
    if (!timestampColumn) return;

    const isMysql = queryRunner.connection.options.type === "mysql";
    
    if (isMysql && timestampColumn.type === "bigint") {
      await queryRunner.query(`
        ALTER TABLE transactions 
        MODIFY COLUMN timestamp INT NOT NULL
      `);
    }
  }
}
