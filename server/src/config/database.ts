import "reflect-metadata";
import { DataSource } from "typeorm";
import { TransactionEntity } from "../modules/transactions/transaction.entity.js";
import { AccountEntity } from "../modules/accounts/account.entity.js";
import { UserEntity } from "../modules/users/user.entity.js";
import { AssetHoldingEntity } from "../modules/asset-holdings/asset-holding.entity.js";
import { getDatabaseConfiguration } from "./database-config.js";

const { type, options } = getDatabaseConfiguration();

const entities = [TransactionEntity, AccountEntity, UserEntity, AssetHoldingEntity];

export const dataSource = new DataSource(
  type === "postgres"
    ? {
        type: "postgres",
        host: options.host || "localhost",
        port: options.port || 5432,
        username: options.username || "postgres",
        password: options.password || "",
        database: options.database || "txls",
        entities,
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
        entities,
        synchronize: false,
        logging: false,
      },
);
