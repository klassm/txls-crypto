import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    env: {
      JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
      "@/lib/types": path.resolve(__dirname, "./src/lib/types"),
      "@/app": path.resolve(__dirname, "./src/app"),
      "@/server": path.resolve(__dirname, "./src/server"),
      "@/components": path.resolve(__dirname, "./src/components"),
    },
  },
});