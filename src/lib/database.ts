import "reflect-metadata";
import { DataSource, MigrationInterface } from "typeorm";
import { AccountEntity } from "@/server/modules/accounts/account.entity";
import { TransactionEntity } from "@/server/modules/transactions/transaction.entity";
import { UserEntity } from "@/server/modules/users/user.entity";
import { getDatabaseConfiguration } from "@/server/config/database-config";
import path from "node:path";
import fs from "node:fs";

let dataSource: DataSource | null = null;

function getMigrations(): Function[] {
  const distPath = path.join(process.cwd(), "dist", "migrations");
  console.log("[DB] Looking for migrations in:", distPath);
  console.log("[DB] Directory exists:", fs.existsSync(distPath));
  
  if (fs.existsSync(distPath)) {
    const migrationFiles = fs.readdirSync(distPath).filter((f: string) => f.endsWith(".js"));
    console.log("[DB] Found migration files:", migrationFiles);
    
    return migrationFiles.map((file: string) => {
      const migrationPath = path.join(distPath, file.replace(".js", ""));
      console.log("[DB] Loading migration from:", migrationPath);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migration = require(/* webpackIgnore: true */ migrationPath);
      const MigrationClass = Object.values(migration)[0] as Function;
      console.log("[DB] Migration class name:", MigrationClass?.name);
      return MigrationClass;
    });
  }
  console.log("[DB] No migrations directory found, returning empty array");
  return [];
}

export async function getDataSource(): Promise<DataSource> {
  if (dataSource) {
    return dataSource;
  }

  const { type, options } = getDatabaseConfiguration();
  const migrations = getMigrations();

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
