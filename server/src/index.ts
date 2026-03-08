import "reflect-metadata";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config/env.js";

import accountsRouter from "./routes/accounts/index.js";
import authRouter from "./routes/auth/index.js";
import adminRouter from "./routes/admin/index.js";
import providersRouter from "./routes/providers/index.js";
import taxRouter from "./routes/tax/index.js";
import sourcesRouter from "./routes/sources/index.js";
import configRouter from "./routes/config/index.js";
import pricesRouter from "./routes/prices/index.js";
import { getDataSource } from "./database.js";
import { PriceFetcherService } from "./modules/prices/index.js";

const app = express();
const PORT = process.env.PORT || 3001;

let priceFetcher: PriceFetcherService | null = null;

async function startServer() {
	console.log("[Server] Starting...");
	
	const dataSource = await getDataSource();
	
	priceFetcher = new PriceFetcherService(dataSource);
	await priceFetcher.start();
	
	app.set("trust proxy", true);
	app.use(helmet());
	app.use(cors({
		origin: process.env.NODE_ENV === "production" ? false : "http://localhost:3000",
		credentials: true,
	}));
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use(cookieParser());

	app.use("/api/accounts", accountsRouter);
	app.use("/api/auth", authRouter);
	app.use("/api/admin", adminRouter);
	app.use("/api/providers", providersRouter);
	app.use("/api/tax", taxRouter);
	app.use("/api/sources", sourcesRouter);
	app.use("/api/config", configRouter);
	app.use("/api/prices", pricesRouter);

	app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
		console.error("Unhandled error:", err);
		res.status(500).json({ error: "Internal server error" });
	});

	app.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`);
	});
}

process.on("SIGTERM", () => {
	console.log("[Server] Received SIGTERM, shutting down...");
	if (priceFetcher) {
		priceFetcher.stop();
	}
	process.exit(0);
});

process.on("SIGINT", () => {
	console.log("[Server] Received SIGINT, shutting down...");
	if (priceFetcher) {
		priceFetcher.stop();
	}
	process.exit(0);
});

startServer().catch((error) => {
	console.error("[Server] Failed to start:", error);
	process.exit(1);
});
