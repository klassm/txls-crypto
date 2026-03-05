import "reflect-metadata";
import { DataSource } from "typeorm";
import { AccountEntity } from "./modules/accounts/account.entity.js";
import { TransactionEntity } from "./modules/transactions/transaction.entity.js";
import { UserEntity } from "./modules/users/user.entity.js";
import { getDatabaseConfiguration } from "./config/database-config.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dataSource: DataSource | null = null;

async function getMigrations(): Promise<Function[]> {
  const migrationsDir = path.join(__dirname, "migrations");
  
  if (!fs.existsSync(migrationsDir)) {
    console.log("[DB] No migrations directory found at:", migrationsDir);
    return [];
  }
  
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith(".js") || f.endsWith(".ts"));
  console.log("[DB] Found migration files:", migrationFiles);
  
  const migrations: Function[] = [];
  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const migration = await import(`file://${migrationPath}`);
    const MigrationClass = Object.values(migration)[0] as Function;
    if (MigrationClass) {
      migrations.push(MigrationClass);
    }
  }
  return migrations;
}

export async function getDataSource(): Promise<DataSource> {
  if (dataSource) {
    return dataSource;
  }

  const { type, options } = getDatabaseConfiguration();
  const migrations = await getMigrations();

  try {
    if (type === "better-sqlite3") {
      dataSource = new DataSource({
        type: "better-sqlite3",
        database: options.path || "./data/txls.db",
        entities: [UserEntity, TransactionEntity, AccountEntity],
        migrations,
        synchronize: false,
        logging: ["error", "migration"],
      });
    } else if (type === "postgres") {
      dataSource = new DataSource({
        type: "postgres",
        host: options.host || "localhost",
        port: options.port || 5432,
        username: options.username || "postgres",
        password: options.password || "",
        database: options.database || "txls",
        entities: [UserEntity, TransactionEntity, AccountEntity],
        migrations,
        synchronize: false,
        logging: ["error", "migration"],
      });
    } else {
      dataSource = new DataSource({
        type: "mysql",
        host: options.host || "localhost",
        port: options.port || 3306,
        username: options.username || "root",
        password: options.password || "",
        database: options.database || "txls",
        entities: [UserEntity, TransactionEntity, AccountEntity],
        migrations,
        synchronize: false,
        logging: ["migration"],
      });
    }

    console.log("[DB] Initializing data source...");
    await dataSource.initialize();
    console.log("[DB] Data source initialized.");

    console.log("[DB] Running migrations...");
    await dataSource.runMigrations({ transaction: "all" });
    console.log("[DB] Migrations completed.");
  } catch (error) {
    console.error("[DB] Database initialization error:", error);
    throw error;
  }

  return dataSource;
}

export function resetDataSource(): void {
  dataSource = null;
}
