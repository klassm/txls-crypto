import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DataSource } from "typeorm";
import { TransactionEntity } from "../../src/modules/transactions/transaction.entity.js";
import { DateTime } from "luxon";

const mysqlConfig = {
  type: "mysql" as const,
  host: "localhost",
  port: 3306,
  username: "root",
  password: "rootpass",
  synchronize: false,
};

describe("MySQL Timestamp Column Migration", () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const initDataSource = new DataSource({ ...mysqlConfig });
    await initDataSource.initialize();
    await initDataSource.query(`DROP DATABASE IF EXISTS txls_migration_test`);
    await initDataSource.query(`CREATE DATABASE txls_migration_test`);
    await initDataSource.destroy();
    
    dataSource = new DataSource({ ...mysqlConfig, database: "txls_migration_test" });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const initDataSource = new DataSource({ ...mysqlConfig });
      await initDataSource.initialize();
      await initDataSource.query(`DROP DATABASE IF EXISTS txls_migration_test`);
      await initDataSource.destroy();
      await dataSource.destroy();
    }
  });

  it("should reproduce the bug: INT column cannot store 2025 timestamps", async () => {
    await dataSource.query(`
      CREATE TABLE transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        provider_account_id INT NOT NULL,
        external_id VARCHAR(255) NOT NULL,
        timestamp INT NOT NULL,
        type VARCHAR(255) NOT NULL,
        asset VARCHAR(255) NOT NULL,
        quantity DECIMAL(18,8) NOT NULL,
        eur_value DECIMAL(18,8) NOT NULL,
        eur_fee DECIMAL(18,8) NOT NULL DEFAULT 0,
        eur_rate DECIMAL(18,8) NOT NULL DEFAULT 0,
        processed BOOLEAN NOT NULL DEFAULT false,
        created_at BIGINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL DEFAULT 0,
        UNIQUE KEY (external_id)
      )
    `);

    const timestamp2025 = DateTime.fromISO("2025-01-05T09:30:22").toMillis();
    expect(timestamp2025).toBeGreaterThan(2147483647);

    await expect(
      dataSource.query(
        `INSERT INTO transactions (user_id, provider_account_id, external_id, timestamp, type, asset, quantity, eur_value, eur_fee, eur_rate, processed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, 1, "test-2025", timestamp2025, "buy", "BTC", 0.01, 1000, 1, 100000, false, Date.now(), Date.now()]
      )
    ).rejects.toThrow(/Out of range value for column 'timestamp'/);
  });

  it("should fix the issue: migration converts INT to BIGINT", async () => {
    await dataSource.query(`ALTER TABLE transactions MODIFY COLUMN timestamp BIGINT NOT NULL`);

    const table = await dataSource.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'transactions' 
      AND COLUMN_NAME = 'timestamp'
      AND TABLE_SCHEMA = 'txls_migration_test'
    `);
    
    expect(table[0].DATA_TYPE).toBe("bigint");

    const timestamp2025 = DateTime.fromISO("2025-01-05T09:30:22").toMillis();
    
    await dataSource.query(
      `INSERT INTO transactions (user_id, provider_account_id, external_id, timestamp, type, asset, quantity, eur_value, eur_fee, eur_rate, processed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 1, "test-2025-fixed", timestamp2025, "buy", "BTC", 0.01, 1000, 1, 100000, false, Date.now(), Date.now()]
    );

    const [result] = await dataSource.query(`SELECT timestamp FROM transactions WHERE external_id = 'test-2025-fixed'`);
    expect(Number(result.timestamp)).toBe(timestamp2025);
  });
});
