import "reflect-metadata";
import { DataSource } from "typeorm";
import { TransactionEntity } from "../modules/transactions/transaction.entity.js";
import { AccountEntity } from "../modules/accounts/account.entity.js";
import { UserEntity } from "../modules/users/user.entity.js";
import { PortfolioSnapshotEntity } from "../modules/portfolio-snapshots/portfolio-snapshot.entity.js";
import { getDatabaseConfiguration } from "./database-config.js";

const { type, options } = getDatabaseConfiguration();

export const dataSource = new DataSource(
  type === "better-sqlite3"
    ? {
        type: "better-sqlite3",
        database: options.path || "./data/txls.db",
        entities: [TransactionEntity, AccountEntity, UserEntity, PortfolioSnapshotEntity],
        synchronize: false,
        logging: false,
      }
    : type === "postgres"
      ? {
          type: "postgres",
          host: options.host || "localhost",
          port: options.port || 5432,
          username: options.username || "postgres",
          password: options.password || "",
          database: options.database || "txls",
          entities: [TransactionEntity, AccountEntity, UserEntity, PortfolioSnapshotEntity],
          synchronize: false,
          logging: false,
        }
      : {
          type: "mysql",
          host: options.host || "localhost",
          port: options.port || 3306,
          username: options.username || "root",
          password: options.password || "",
          database: options.database || "txls",
          entities: [TransactionEntity, AccountEntity, UserEntity, PortfolioSnapshotEntity],
          synchronize: false,
          logging: false,
        },
);
