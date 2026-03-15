import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.spec.tsx", "src/**/*.test.tsx"],
	},
	resolve: {
		alias: {
			"@txls/shared": path.resolve(__dirname, "../shared/src"),
		},
	},
});
