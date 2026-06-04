import { config } from "./env.js";

export type DatabaseType = "mysql" | "postgres";

interface ConnectionStringOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

export function parseConnectionString(connectionString: string): {
  type: DatabaseType;
  options: ConnectionStringOptions;
} {
  const trimmedString = connectionString.trim();

  if (trimmedString.startsWith("postgres://") || trimmedString.startsWith("postgresql://")) {
    const url = new URL(trimmedString);
    return {
      type: "postgres",
      options: {
        host: url.hostname || "localhost",
        port: url.port ? parseInt(url.port, 10) : 5432,
        username: url.username,
        password: url.password,
        database: url.pathname.slice(1),
      },
    };
  }

  if (trimmedString.startsWith("mysql://") || trimmedString.startsWith("mariadb://")) {
    const url = new URL(trimmedString);
    return {
      type: "mysql",
      options: {
        host: url.hostname || "localhost",
        port: url.port ? parseInt(url.port, 10) : 3306,
        username: url.username,
        password: url.password,
        database: url.pathname.slice(1),
      },
    };
  }

  throw new Error(
    `Unsupported database connection string: "${trimmedString}". Must be a mysql://, mariadb://, postgres://, or postgresql:// URL.`
  );
}

export function getDatabaseConfiguration(): ReturnType<typeof parseConnectionString> {
  const connectionString = config.database.connectionString;
  return parseConnectionString(connectionString);
}
