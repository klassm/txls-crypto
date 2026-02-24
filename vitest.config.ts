import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.ts"],
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    env: {
      JWT_SECRET: "test-secret-key-for-jwt-signing-in-tests",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.styles.ts", "src/test/**/*"],
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
