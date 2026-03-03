import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDataSource, resetDataSource } from "@txls/shared";
import { rmSync } from "fs";
import path from "path";

const testConfigs = [
  {
    name: "better-sqlite3",
    displayName: "SQLite",
    connectionString: "./data/test-txls.db",
    setup: async () => {
      process.env.DB_CONNECTION_STRING = "./data/test-txls.db";
    },
    teardown: async () => {
      const dbPath = path.join(process.cwd(), "data/test-txls.db");
      try {
        rmSync(dbPath, { force: true });
      } catch (e) {
      }
    },
  },
  {
    name: "postgres",
    displayName: "PostgreSQL",
    connectionString: "postgresql://testuser:testpass@localhost:5432/txls_test",
    setup: async () => {
      process.env.DB_CONNECTION_STRING = "postgresql://testuser:testpass@localhost:5432/txls_test";
    },
    teardown: async () => {},
  },
  {
    name: "mysql",
    displayName: "MySQL",
    connectionString: "mysql://testuser:testpass@localhost:3306/txls_test",
    setup: async () => {
      process.env.DB_CONNECTION_STRING = "mysql://testuser:testpass@localhost:3306/txls_test";
    },
    teardown: async () => {},
  },
];

describe.each(testConfigs)("$displayName Database Integration", ({ name, displayName, connectionString, setup, teardown }) => {
  const originalDbConnectionString = process.env.DB_CONNECTION_STRING;

  beforeAll(async () => {
    resetDataSource();
    await setup();
  });

  afterAll(async () => {
    const ds = await getDataSource();
    if (ds && ds.isInitialized) {
      await ds.destroy();
    }
    resetDataSource();
    process.env.DB_CONNECTION_STRING = originalDbConnectionString;
    await teardown();
  });

  it("should initialize database and run migrations", async () => {
    const ds = await getDataSource();
    
    expect(ds).toBeDefined();
    expect(ds.isInitialized).toBe(true);
    expect(ds.options.type).toBe(name as any);

    let tables: string[] = [];

    if (name === "better-sqlite3") {
      const result = await ds.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      tables = result.map((t: any) => t.name);
    } else if (name === "postgres") {
      const result = await ds.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
      tables = result.map((t: any) => t.table_name);
    } else if (name === "mysql") {
      const result = await ds.query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
      const key = result.length > 0 && result[0].table_name ? "table_name" : "TABLE_NAME";
      tables = result.map((t: any) => t[key]);
    }

    expect(tables).toContain("users");
    expect(tables).toContain("provider_accounts");
    expect(tables).toContain("transactions");
    expect(tables).toContain("migrations");
  });

  it("should be able to query the database", async () => {
    const ds = await getDataSource();

    const result = await ds.query("SELECT COUNT(*) as count FROM users");
    const count = Array.isArray(result) ? result[0].count : result.count;
    expect(count).toBeDefined();
    expect(Number(count)).toBeGreaterThanOrEqual(0);
  });

  it("should track migration in migrations table", async () => {
    const ds = await getDataSource();

    let migrationCheck;
    if (name === "better-sqlite3") {
      migrationCheck = await ds.query(`SELECT * FROM migrations`);
    } else if (name === "postgres") {
      migrationCheck = await ds.query(`SELECT * FROM migrations`);
    } else if (name === "mysql") {
      migrationCheck = await ds.query(`SELECT * FROM migrations`);
    }

    expect(migrationCheck).toBeDefined();
    expect(migrationCheck.length).toBeGreaterThan(0);
    expect(migrationCheck[0].name).toContain("InitialSchema");
  });
});