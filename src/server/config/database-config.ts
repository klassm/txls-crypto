import { config } from "@/server/config/env";

export type DatabaseType = "mysql" | "postgres" | "better-sqlite3";

interface ConnectionStringOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  path?: string;
}

export function parseConnectionString(connectionString: string): {
  type: DatabaseType;
  options: ConnectionStringOptions;
} {
  const trimmedString = connectionString.trim();

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

  if (trimmedString.startsWith("sqlite://") || trimmedString.startsWith("better-sqlite://")) {
    const path = trimmedString.replace(/^sqlite:\/\/|^better-sqlite:\/\//, "");
    return {
      type: "better-sqlite3",
      options: {
        path: path || "./data/txls.db",
      },
    };
  }

  if (trimmedString.endsWith(".db") || trimmedString.endsWith(".sqlite") || trimmedString.endsWith(".sqlite3")) {
    return {
      type: "better-sqlite3",
      options: {
        path: trimmedString,
      },
    };
  }

  if (trimmedString.startsWith("/")) {
    return {
      type: "better-sqlite3",
      options: {
        path: trimmedString,
      },
    };
  }

  return {
    type: "better-sqlite3",
    options: {
      path: trimmedString || "./data/txls.db",
    },
  };
}

export function getDatabaseConfiguration(): ReturnType<typeof parseConnectionString> {
  const connectionString = config.database.connectionString;
  return parseConnectionString(connectionString);
}