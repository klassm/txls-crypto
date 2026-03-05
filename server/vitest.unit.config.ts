import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    env: {
      JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests",
    },
  },
});