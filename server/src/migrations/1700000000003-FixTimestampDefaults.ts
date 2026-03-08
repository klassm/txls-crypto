import type { MigrationInterface, QueryRunner } from "typeorm";

export class FixTimestampDefaults1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const dbType = queryRunner.connection.options.type;
    
    if (dbType === "mysql") {
      await queryRunner.query(`ALTER TABLE \`users\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`users\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`provider_accounts\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`provider_accounts\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`transactions\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`transactions\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`portfolio_snapshots\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`portfolio_snapshots\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`coingecko_ids\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`coingecko_ids\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE \`asset_prices\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL DEFAULT 0`);
    } else if (dbType === "postgres") {
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "provider_accounts" ALTER COLUMN "created_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "provider_accounts" ALTER COLUMN "updated_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "updated_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "portfolio_snapshots" ALTER COLUMN "created_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "portfolio_snapshots" ALTER COLUMN "updated_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "coingecko_ids" ALTER COLUMN "created_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "coingecko_ids" ALTER COLUMN "updated_at" SET DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "asset_prices" ALTER COLUMN "created_at" SET DEFAULT 0`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dbType = queryRunner.connection.options.type;
    
    if (dbType === "mysql") {
      await queryRunner.query(`ALTER TABLE \`users\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`users\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`provider_accounts\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`provider_accounts\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`transactions\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`transactions\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`portfolio_snapshots\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`portfolio_snapshots\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`coingecko_ids\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`coingecko_ids\` MODIFY COLUMN \`updated_at\` BIGINT NOT NULL`);
      await queryRunner.query(`ALTER TABLE \`asset_prices\` MODIFY COLUMN \`created_at\` BIGINT NOT NULL`);
    } else if (dbType === "postgres") {
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "created_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "provider_accounts" ALTER COLUMN "created_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "provider_accounts" ALTER COLUMN "updated_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "created_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "updated_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "portfolio_snapshots" ALTER COLUMN "created_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "portfolio_snapshots" ALTER COLUMN "updated_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "coingecko_ids" ALTER COLUMN "created_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "coingecko_ids" ALTER COLUMN "updated_at" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "asset_prices" ALTER COLUMN "created_at" DROP DEFAULT`);
    }
  }
}
