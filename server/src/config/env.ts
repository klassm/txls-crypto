export const config = {
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  nodeEnv: process.env.NODE_ENV || "development",
  database: {
    get connectionString() {
      return process.env.DB_CONNECTION_STRING || "./data/txls.db";
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
} as const;