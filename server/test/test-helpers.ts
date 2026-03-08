import { getDataSource, resetDataSource } from "../src/database.js";

export async function createTestDataSource(dbConnectionString: string = ":memory:"): Promise<void> {
  process.env.DB_CONNECTION_STRING = dbConnectionString;
  resetDataSource();
  await getDataSource();
}

export async function destroyTestDataSource(): Promise<void> {
  const ds = await getDataSource();
  if (ds?.isInitialized) {
    await ds.destroy();
  }
  resetDataSource();
  delete process.env.DB_CONNECTION_STRING;
}
