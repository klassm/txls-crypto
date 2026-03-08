import pino from "pino";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import { CoinGeckoIdEntity } from "./coingecko-id.entity.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";

const logger = pino({ level: "info" });

export interface CoinGeckoCoin {
	id: string;
	symbol: string;
	name: string;
}

export interface CoinPrice {
	symbol: string;
	priceEur: number;
	fetchedAt: DateTime;
}

const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const RATE_LIMIT_DELAY_MS = 12_000;
const MAX_SYMBOLS_PER_REQUEST = 50;

export class CoinGeckoService {
	private lastRequestTime = 0;
	private symbolToIdCache: Map<string, string> = new Map();
	private initialized = false;

	constructor(private dataSource: DataSource) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		await this.loadSymbolMappingFromDb();
		await this.cacheSymbolsFromTransactions();
		this.initialized = true;
	}

	private async loadSymbolMappingFromDb(): Promise<void> {
		const repo = this.dataSource.getRepository(CoinGeckoIdEntity);
		const mappings = await repo.find({ where: { isActive: true } });

		for (const mapping of mappings) {
			this.symbolToIdCache.set(mapping.symbol.toUpperCase(), mapping.coinGeckoId);
		}

		logger.info({ count: mappings.length }, "[CoinGecko] Loaded symbol mappings from DB");
	}

	private async cacheSymbolsFromTransactions(): Promise<void> {
		const repo = this.dataSource.getRepository(TransactionEntity);
		const results = await repo
			.createQueryBuilder("transaction")
			.select("DISTINCT transaction.asset", "asset")
			.getRawMany();

		const symbols = results.map((r) => r.asset as string).filter((s) => s);
		const uncachedSymbols = symbols.filter((s) => !this.symbolToIdCache.has(s.toUpperCase()));

		if (uncachedSymbols.length === 0) {
			logger.info("[CoinGecko] All transaction symbols already cached");
			return;
		}

		logger.info({ symbols: uncachedSymbols }, "[CoinGecko] Looking up uncached symbols");

		for (const symbol of uncachedSymbols) {
			await this.lookupAndCacheSymbol(symbol);
		}
	}

	private async lookupAndCacheSymbol(symbol: string): Promise<void> {
		try {
			await this.enforceRateLimit();

			const response = await fetch(
				`${COINGECKO_API_BASE}/search?query=${encodeURIComponent(symbol.toLowerCase())}`
			);

			if (!response.ok) {
				logger.warn({ status: response.status, symbol }, "[CoinGecko] Failed to search for symbol");
				return;
			}

			const data = (await response.json()) as { coins: CoinGeckoCoin[] };
			this.lastRequestTime = Date.now();

			const coins = data.coins || [];
			const matchingCoin = this.findBestMatch(symbol, coins);

			if (!matchingCoin) {
				logger.warn({ symbol }, "[CoinGecko] No matching coin found");
				return;
			}

			this.symbolToIdCache.set(symbol.toUpperCase(), matchingCoin.id);

			await this.persistSymbolMapping(symbol.toUpperCase(), matchingCoin);

			logger.info({ symbol, coinGeckoId: matchingCoin.id, name: matchingCoin.name }, "[CoinGecko] Cached symbol mapping");
		} catch (error) {
			logger.error({ error, symbol }, "[CoinGecko] Error looking up symbol");
		}
	}

	private findBestMatch(symbol: string, coins: CoinGeckoCoin[]): CoinGeckoCoin | null {
		const upperSymbol = symbol.toUpperCase();

		const exactMatch = coins.find(
			(c) => c.symbol.toUpperCase() === upperSymbol
		);
		if (exactMatch) return exactMatch;

		const knownMajorCoins = new Set([
			"bitcoin", "ethereum", "solana", "ripple", "cardano", "polkadot",
			"dogecoin", "avalanche-2", "chainlink", "polygon", "litecoin",
			"uniswap", "stellar", "cosmos", "monero"
		]);

		const majorCoin = coins.find(
			(c) => c.symbol.toUpperCase() === upperSymbol && knownMajorCoins.has(c.id)
		);
		if (majorCoin) return majorCoin;

		const symbolMatch = coins.find(
			(c) => c.symbol.toUpperCase() === upperSymbol
		);
		if (symbolMatch) return symbolMatch;

		return null;
	}

	private async persistSymbolMapping(symbol: string, coin: CoinGeckoCoin): Promise<void> {
		const repo = this.dataSource.getRepository(CoinGeckoIdEntity);

		try {
			const entity = repo.create({
				symbol,
				coinGeckoId: coin.id,
				name: coin.name,
				isActive: true,
				createdAt: DateTime.utc(),
				updatedAt: DateTime.utc(),
			});

			await repo
				.createQueryBuilder()
				.insert()
				.into(CoinGeckoIdEntity)
				.values(entity)
				.orUpdate(["coingecko_id", "name", "updated_at"], ["symbol"])
				.execute();
		} catch (error) {
			logger.warn({ error, symbol }, "[CoinGecko] Error persisting symbol mapping");
		}
	}

	async fetchPrices(symbols: string[]): Promise<CoinPrice[]> {
		if (symbols.length === 0) return [];

		for (const symbol of symbols) {
			if (!this.symbolToIdCache.has(symbol.toUpperCase())) {
				await this.lookupAndCacheSymbol(symbol);
			}
		}

		const batchSize = MAX_SYMBOLS_PER_REQUEST;
		const results: CoinPrice[] = [];

		for (let i = 0; i < symbols.length; i += batchSize) {
			const batch = symbols.slice(i, i + batchSize);
			const batchResults = await this.fetchPricesBatch(batch);
			results.push(...batchResults);
		}

		return results;
	}

	private async fetchPricesBatch(symbols: string[]): Promise<CoinPrice[]> {
		try {
			await this.enforceRateLimit();

			const coinGeckoIds = symbols
				.map((s) => this.symbolToIdCache.get(s.toUpperCase()))
				.filter((id): id is string => !!id);

			if (coinGeckoIds.length === 0) {
				return [];
			}

			const idsParam = coinGeckoIds.join(",");
			const url = `${COINGECKO_API_BASE}/simple/price?ids=${idsParam}&vs_currencies=eur`;

			const response = await fetch(url);
			if (!response.ok) {
				logger.warn({ status: response.status }, "[CoinGecko] Failed to fetch prices");
				return [];
			}

			const data = (await response.json()) as Record<string, { eur?: number }>;
			this.lastRequestTime = Date.now();

			const fetchedAt = DateTime.utc();
			const results: CoinPrice[] = [];

			for (const symbol of symbols) {
				const coinGeckoId = this.symbolToIdCache.get(symbol.toUpperCase());
				if (!coinGeckoId) continue;

				const priceData = data[coinGeckoId];
				if (priceData?.eur !== undefined) {
					results.push({
						symbol: symbol.toUpperCase(),
						priceEur: priceData.eur,
						fetchedAt,
					});
				}
			}

			return results;
		} catch (error) {
			logger.error({ error, symbols }, "[CoinGecko] Error fetching prices");
			return [];
		}
	}

	private async enforceRateLimit(): Promise<void> {
		const elapsed = Date.now() - this.lastRequestTime;
		if (elapsed < RATE_LIMIT_DELAY_MS) {
			const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
	}

	getCoinGeckoId(symbol: string): string | undefined {
		return this.symbolToIdCache.get(symbol.toUpperCase());
	}

	getCachedSymbols(): string[] {
		return Array.from(this.symbolToIdCache.keys());
	}
}
