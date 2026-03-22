import pino from "pino";
import cron from "node-cron";
import type { DataSource } from "typeorm";
import { injectable, inject } from "inversify";
import { DateTime } from "luxon";
import { TYPES } from "../../di/types.js";
import { CoinGeckoService } from "./coingecko.service.js";
import { PricesRepository } from "./prices.repository.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";

const logger = pino({ level: "info" });

const PRICE_FETCH_INTERVAL_CRON = "*/5 * * * *";
const PRICE_RETENTION_DAYS = 365;

@injectable()
export class PriceFetcherService {
	private priceCronJob: cron.ScheduledTask | null = null;
	private isFetching = false;
	private coinGeckoService: CoinGeckoService;
	private pricesRepository: PricesRepository;

	constructor(
		@inject(TYPES.DataSource) private dataSource: DataSource,
		@inject(TYPES.CoinGeckoService) coinGeckoService: CoinGeckoService,
		@inject(TYPES.PricesRepository) pricesRepository: PricesRepository
	) {
		this.coinGeckoService = coinGeckoService;
		this.pricesRepository = pricesRepository;
	}

	async start(): Promise<void> {
		logger.info("[PriceFetcher] Initializing CoinGecko service...");
		await this.coinGeckoService.initialize();

		logger.info("[PriceFetcher] Starting scheduled services...");

		await this.fetchPricesOnce();

		this.priceCronJob = cron.schedule(PRICE_FETCH_INTERVAL_CRON, async () => {
			await this.fetchPricesOnce();
		});

		logger.info({ 
			priceSchedule: PRICE_FETCH_INTERVAL_CRON,
		}, "[PriceFetcher] Scheduled jobs started");
	}

	stop(): void {
		if (this.priceCronJob) {
			this.priceCronJob.stop();
			this.priceCronJob = null;
		}
		logger.info("[PriceFetcher] Stopped scheduled jobs");
	}

	async fetchPricesOnce(): Promise<void> {
		if (this.isFetching) {
			logger.debug("[PriceFetcher] Already fetching, skipping...");
			return;
		}

		this.isFetching = true;
		const startTime = Date.now();

		try {
			const assets = await this.getActiveAssets();

			if (assets.length === 0) {
				logger.info("[PriceFetcher] No assets to fetch prices for");
				return;
			}

			logger.info({ assetCount: assets.length, assets }, "[PriceFetcher] Fetching prices...");

			const prices = await this.coinGeckoService.fetchPrices(assets);

			if (prices.length > 0) {
				await this.pricesRepository.savePrices(prices);
				logger.info({ priceCount: prices.length }, "[PriceFetcher] Saved prices");
			}

			await this.cleanupOldPrices();

			const duration = Date.now() - startTime;
			logger.info({ duration: `${duration}ms`, fetched: prices.length }, "[PriceFetcher] Fetch complete");
		} catch (error) {
			logger.error({ error }, "[PriceFetcher] Error during price fetch");
		} finally {
			this.isFetching = false;
		}
	}

	private async getActiveAssets(): Promise<string[]> {
		const repo = this.dataSource.getRepository(TransactionEntity);
		const results = await repo
			.createQueryBuilder("transaction")
			.select("DISTINCT transaction.asset", "asset")
			.getRawMany();

		return results.map(r => r.asset as string);
	}

	private async cleanupOldPrices(): Promise<void> {
		try {
			const deleted = await this.pricesRepository.deleteOldPrices(PRICE_RETENTION_DAYS);
			if (deleted > 0) {
				logger.info({ deleted }, "[PriceFetcher] Cleaned up old prices");
			}
		} catch (error) {
			logger.error({ error }, "[PriceFetcher] Error cleaning up old prices");
		}
	}
}
