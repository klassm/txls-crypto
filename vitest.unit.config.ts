import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [path.resolve(__dirname, "shared/src/**/*.spec.ts")],
    testTimeout: 15000,
    hookTimeout: 15000,
    env: {
      JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests",
    },
  },
});