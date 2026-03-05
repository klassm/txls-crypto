import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    env: {
      JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests",
    },
  },
});
