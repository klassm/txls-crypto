import pino from "pino";
import { DateTime } from "luxon";
import type { DataSource } from "typeorm";
import { CoinGeckoIdEntity } from "./coingecko-id.entity.js";

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
		await this.fetchAndCacheCoinList();
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

	private async fetchAndCacheCoinList(): Promise<void> {
		try {
			await this.enforceRateLimit();
			const response = await fetch(`${COINGECKO_API_BASE}/coins/list`);
			
			if (!response.ok) {
				logger.warn({ status: response.status }, "[CoinGecko] Failed to fetch coin list");
				return;
			}

			const coins = (await response.json()) as CoinGeckoCoin[];
			this.lastRequestTime = Date.now();

			const symbolToBestCoin = this.resolveSymbolConflicts(coins);

			await this.persistSymbolMappings(symbolToBestCoin);

			logger.info({ count: symbolToBestCoin.size }, "[CoinGecko] Cached coin list");
		} catch (error) {
			logger.error({ error }, "[CoinGecko] Error fetching coin list");
		}
	}

	private resolveSymbolConflicts(coins: CoinGeckoCoin[]): Map<string, CoinGeckoCoin> {
		const symbolToCoins = new Map<string, CoinGeckoCoin[]>();

		for (const coin of coins) {
			const symbol = coin.symbol.toUpperCase();
			if (!symbolToCoins.has(symbol)) {
				symbolToCoins.set(symbol, []);
			}
			symbolToCoins.get(symbol)!.push(coin);
		}

		const result = new Map<string, CoinGeckoCoin>();
		const knownMajorCoins = new Set([
			"bitcoin", "ethereum", "solana", "ripple", "cardano", "polkadot",
			"dogecoin", "avalanche-2", "chainlink", "polygon", "litecoin",
			"uniswap", "stellar", "cosmos", "monero"
		]);

		for (const [symbol, coinList] of symbolToCoins) {
			const majorCoin = coinList.find(c => knownMajorCoins.has(c.id));
			const selectedCoin = majorCoin || coinList[0];
			result.set(symbol, selectedCoin);
		}

		return result;
	}

	private async persistSymbolMappings(mappings: Map<string, CoinGeckoCoin>): Promise<void> {
		const repo = this.dataSource.getRepository(CoinGeckoIdEntity);
		
		for (const [symbol, coin] of mappings) {
			this.symbolToIdCache.set(symbol, coin.id);
		}

		const entities = Array.from(mappings.entries()).map(([symbol, coin]) => ({
			symbol,
			coinGeckoId: coin.id,
			name: coin.name,
			isActive: true,
			createdAt: DateTime.utc(),
			updatedAt: DateTime.utc(),
		}));

		if (entities.length === 0) return;

		const batchSize = 100;
		for (let i = 0; i < entities.length; i += batchSize) {
			const batch = entities.slice(i, i + batchSize);
			try {
				await repo
					.createQueryBuilder()
					.insert()
					.into(CoinGeckoIdEntity)
					.values(batch)
					.orUpdate(["coingecko_id", "name", "updated_at"], ["symbol"])
					.execute();
			} catch (error) {
				logger.warn({ error, batchIndex: i }, "[CoinGecko] Error persisting batch, continuing...");
			}
		}
	}

	async fetchPrices(symbols: string[]): Promise<CoinPrice[]> {
		if (symbols.length === 0) return [];

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

			const symbolsParam = symbols.map(s => s.toLowerCase()).join(",");
			const url = `${COINGECKO_API_BASE}/simple/price?symbols=${symbolsParam}&vs_currencies=eur`;

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
				const priceData = coinGeckoId ? data[coinGeckoId] : data[symbol.toLowerCase()];

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
			await new Promise(resolve => setTimeout(resolve, waitTime));
		}
	}

	getCoinGeckoId(symbol: string): string | undefined {
		return this.symbolToIdCache.get(symbol.toUpperCase());
	}

	getCachedSymbols(): string[] {
		return Array.from(this.symbolToIdCache.keys());
	}
}
