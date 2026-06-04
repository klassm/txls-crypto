export const config = {
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  nodeEnv: process.env.NODE_ENV || "development",
  database: {
    get connectionString() {
      return process.env.DB_CONNECTION_STRING || "mysql://root:root@localhost:3306/txls";
    },
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  homeAssistant: {
    get supervisorToken() {
      return process.env.SUPERVISOR_TOKEN;
    },
  },
  apiSync: {
    enabled: process.env.API_SYNC_ENABLED !== "false",
    interval: process.env.API_SYNC_INTERVAL || "0 3 * * *",
    get encryptionKey() {
      return process.env.ENCRYPTION_KEY || null;
    },
  },
} as const;