import type { DataSource } from "typeorm";
import type { AssetStat } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { AssetHoldingsRepository, type AssetHoldingData, type HoldingState } from "./asset-holdings.repository.js";
import { AssetHoldingEntity } from "./asset-holding.entity.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { AccountEntity } from "../accounts/account.entity.js";
import { PricesRepository } from "../prices/prices.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { AssetPriceEntity } from "../prices/asset-price.entity.js";
import { logger } from "../../common/logger.js";

export interface PortfolioHistoryPoint {
	date: string;
	totalEurValue: number | null;
	totalEurInvested: number;
	assets: Record<string, { amount: number; eurValue: number | null }>;
}

export interface PortfolioHistoryOptions {
	days?: number;
	hourlyForDays?: number;
}

export interface AssetPriceHistoryPoint {
	date: string;
	priceEur: number;
}

export interface AssetOverview {
	asset: string;
	amount: number;
	eurValue: number | null;
	eurInvested: number;
	priceHistory: AssetPriceHistoryPoint[];
	positionHistory: { date: string; value: number | null }[];
}

export interface AccountOverview {
	accountId: number;
	provider: string;
	eurValue: number | null;
}

export interface StakingStats {
	eurValue: number;
	count: number;
}

export interface PortfolioOverview {
	portfolioHistory: PortfolioHistoryPoint[];
	assets: AssetOverview[];
	accounts: AccountOverview[];
	currentYearStakingRewards: StakingStats;
	totalStakingRewards: StakingStats;
}

export class AssetHoldingsService {
	private repository: AssetHoldingsRepository;
	private dataSource: DataSource;
	private pricesRepository?: PricesRepository;

	constructor(
		dataSource: DataSource,
		repository?: AssetHoldingsRepository,
		pricesRepository?: PricesRepository
	) {
		this.dataSource = dataSource;
		this.repository = repository || new AssetHoldingsRepository(dataSource);
		this.pricesRepository = pricesRepository;
	}

	async getCurrentHoldings(userId: number, providerAccountId: number): Promise<AssetStat[]> {
		const holdings = await this.repository.findLatestByAccount(userId, providerAccountId);
		
		if (holdings.size > 0) {
			return Array.from(holdings.values()).map(h => ({
				asset: h.asset,
				amount: h.amount,
				eurInvested: h.eurInvested,
				buys: 0,
				sells: 0,
			}));
		}

		return this.calculateHoldings(userId, providerAccountId);
	}

	async getAllCurrentHoldings(userId: number): Promise<Map<number, AssetStat[]>> {
		const holdingsByAccount = await this.repository.findLatestByUser(userId);
		
		if (holdingsByAccount.size > 0) {
			const result = new Map<number, AssetStat[]>();
			for (const [accountId, holdings] of holdingsByAccount) {
				result.set(accountId, Array.from(holdings.values()).map(h => ({
					asset: h.asset,
					amount: h.amount,
					eurInvested: h.eurInvested,
					buys: 0,
					sells: 0,
				})));
			}
			return result;
		}

		return this.calculateAllHoldings(userId);
	}

	async rebuildHoldings(userId: number, providerAccountId: number): Promise<void> {
		logger.info({
			message: "Rebuilding asset holdings",
			userId,
			providerAccountId,
		});

		await this.repository.deleteByAccount(userId, providerAccountId);

		const transactions = await this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("tx")
			.where("tx.userId = :userId AND tx.providerAccountId = :providerAccountId", {
				userId,
				providerAccountId,
			})
			.orderBy("tx.timestamp", "ASC")
			.getMany();

		if (transactions.length === 0) {
			return;
		}

		const holdingsByAsset = new Map<string, { amount: number; eurInvested: number }>();
		const holdingData: AssetHoldingData[] = [];

		for (const tx of transactions) {
			const current = holdingsByAsset.get(tx.asset) || { amount: 0, eurInvested: 0 };
			
			const quantity = tx.type === TransactionType.sell || tx.type === TransactionType.withdrawal
				? -Math.abs(tx.quantity)
				: Math.abs(tx.quantity);
			
			const eurInvestedDelta = tx.type === TransactionType.buy || tx.type === TransactionType.deposit
				? tx.eurValue
				: 0;

			const newAmount = current.amount + quantity;
			const newEurInvested = current.eurInvested + eurInvestedDelta;

			holdingsByAsset.set(tx.asset, {
				amount: newAmount,
				eurInvested: newEurInvested,
			});

			if (newAmount > 0) {
				holdingData.push({
					userId,
					providerAccountId,
					asset: tx.asset,
					amount: newAmount,
					eurInvested: newEurInvested,
					timestamp: tx.timestamp as DateTime,
				});
			}
		}

		await this.repository.saveMany(holdingData);
	}

	async rebuildHoldingsFromTimestamp(
		userId: number,
		providerAccountId: number,
		fromTimestamp: DateTime
	): Promise<void> {
		logger.info({
			message: "Rebuilding asset holdings from timestamp",
			userId,
			providerAccountId,
			fromTimestamp: fromTimestamp.toISO(),
		});

		const existingHoldings = await this.repository.findLatestByAccount(userId, providerAccountId);
		if (existingHoldings.size === 0) {
			logger.info({
				message: "No existing holdings found, rebuilding all holdings",
				userId,
				providerAccountId,
			});
			return this.rebuildHoldings(userId, providerAccountId);
		}

		await this.repository.deleteByAccountFromTimestamp(userId, providerAccountId, fromTimestamp);

		const transactions = await this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("tx")
			.where("tx.userId = :userId AND tx.providerAccountId = :providerAccountId", {
				userId,
				providerAccountId,
			})
			.andWhere("tx.timestamp >= :fromTimestamp", { fromTimestamp: fromTimestamp.toMillis() })
			.orderBy("tx.timestamp", "ASC")
			.getMany();

		if (transactions.length === 0) {
			return;
		}

		const holdingsBefore = await this.repository.getHoldingsUpToTimestamp(
			userId,
			providerAccountId,
			fromTimestamp.minus({ milliseconds: 1 })
		);

		const holdingsByAsset = new Map<string, { amount: number; eurInvested: number }>();
		for (const [asset, holding] of holdingsBefore) {
			holdingsByAsset.set(asset, {
				amount: holding.amount,
				eurInvested: holding.eurInvested,
			});
		}

		const holdingData: AssetHoldingData[] = [];

		for (const tx of transactions) {
			const current = holdingsByAsset.get(tx.asset) || { amount: 0, eurInvested: 0 };
			
			const quantity = tx.type === TransactionType.sell || tx.type === TransactionType.withdrawal
				? -Math.abs(tx.quantity)
				: Math.abs(tx.quantity);
			
			const eurInvestedDelta = tx.type === TransactionType.buy || tx.type === TransactionType.deposit
				? tx.eurValue
				: 0;

			const newAmount = current.amount + quantity;
			const newEurInvested = current.eurInvested + eurInvestedDelta;

			holdingsByAsset.set(tx.asset, {
				amount: newAmount,
				eurInvested: newEurInvested,
			});

			if (newAmount > 0) {
				holdingData.push({
					userId,
					providerAccountId,
					asset: tx.asset,
					amount: newAmount,
					eurInvested: newEurInvested,
					timestamp: tx.timestamp as DateTime,
				});
			}
		}

		await this.repository.saveMany(holdingData);
	}

	async getPortfolioHistoryWithPrices(
		userId: number,
		providerAccountId?: number,
		options: PortfolioHistoryOptions = {}
	): Promise<PortfolioHistoryPoint[]> {
		const { days = 30, hourlyForDays = 30 } = options;
		const now = DateTime.utc();
		const endDate = now;
		const startDate = endDate.minus({ days }).startOf("day");

		const pricesRepo = this.pricesRepository || new PricesRepository(this.dataSource);

		const currentHoldings = providerAccountId
			? await this.repository.findLatestByAccount(userId, providerAccountId)
			: await this.repository.findLatestByUser(userId);

		if (currentHoldings.size === 0 || (providerAccountId && currentHoldings.size === 0)) {
			return [];
		}

		const allAssets = new Set<string>();
		for (const [, holdings] of providerAccountId ? [[0, currentHoldings]] : currentHoldings) {
			const h = holdings as Map<string, HoldingState>;
			for (const asset of h.keys()) {
				allAssets.add(asset);
			}
		}

		const assetList = Array.from(allAssets);
		const priceHistories = await this.getPriceHistoriesHourly(pricesRepo, assetList, startDate, endDate);
		const latestPrices = await pricesRepo.getLatestPrices(assetList);

		const timestamps: DateTime[] = [];
		const hourlyCutoff = now.minus({ days: hourlyForDays });
		
		let current = startDate;
		while (current <= endDate) {
			if (current >= hourlyCutoff) {
				for (let hour = 0; hour < 24; hour++) {
					const hourTime = current.plus({ hours: hour });
					if (hourTime <= now) {
						timestamps.push(hourTime);
					}
				}
			} else {
				timestamps.push(current.plus({ hours: 12 }));
			}
			current = current.plus({ days: 1 });
		}

		const result: PortfolioHistoryPoint[] = [];

		for (let i = 0; i < timestamps.length; i++) {
			const ts = timestamps[i];
			const isLastTimestamp = i === timestamps.length - 1;

			const aggregatedHoldings = isLastTimestamp
				? await this.getLatestAggregatedHoldings(userId, providerAccountId)
				: await this.getAggregatedHoldingsAtTimestamp(userId, providerAccountId, ts);

			if (aggregatedHoldings.size === 0) continue;

			const historyPoint = this.buildHistoryPoint(aggregatedHoldings, priceHistories, ts, isLastTimestamp ? latestPrices : undefined);
			if (historyPoint) {
				result.push(historyPoint);
			}
		}

		result.sort((a, b) => a.date.localeCompare(b.date));
		return result;
	}

	private async getLatestAggregatedHoldings(
		userId: number,
		providerAccountId?: number
	): Promise<Map<string, { amount: number; eurInvested: number }>> {
		if (providerAccountId) {
			return this.holdingsMapToAggregated(
				await this.repository.findLatestByAccount(userId, providerAccountId)
			);
		}
		return this.aggregateHoldingsByAccount(await this.repository.findLatestByUser(userId));
	}

	private async getAggregatedHoldingsAtTimestamp(
		userId: number,
		providerAccountId: number | undefined,
		timestamp: DateTime
	): Promise<Map<string, { amount: number; eurInvested: number }>> {
		if (providerAccountId) {
			return this.holdingsMapToAggregated(
				await this.repository.getHoldingsUpToTimestamp(userId, providerAccountId, timestamp)
			);
		}
		return this.aggregateHoldingsByAccount(
			await this.repository.getAllHoldingsUpToTimestamp(userId, timestamp)
		);
	}

	private holdingsMapToAggregated(
		holdings: Map<string, HoldingState>
	): Map<string, { amount: number; eurInvested: number }> {
		const result = new Map<string, { amount: number; eurInvested: number }>();
		for (const [asset, h] of holdings) {
			result.set(asset, { amount: h.amount, eurInvested: h.eurInvested });
		}
		return result;
	}

	private aggregateHoldingsByAccount(
		holdingsByAccount: Map<number, Map<string, HoldingState>>
	): Map<string, { amount: number; eurInvested: number }> {
		const result = new Map<string, { amount: number; eurInvested: number }>();
		for (const [, accountHoldings] of holdingsByAccount) {
			for (const [asset, h] of accountHoldings) {
				const existing = result.get(asset) || { amount: 0, eurInvested: 0 };
				result.set(asset, {
					amount: existing.amount + h.amount,
					eurInvested: existing.eurInvested + h.eurInvested,
				});
			}
		}
		return result;
	}

	private buildHistoryPoint(
		aggregatedHoldings: Map<string, { amount: number; eurInvested: number }>,
		priceHistories: Map<string, { timestamp: DateTime; priceEur: number }[]>,
		timestamp: DateTime,
		latestPrices?: Map<string, AssetPriceEntity>
	): PortfolioHistoryPoint | null {
		let totalEurValue: number | null = 0;
		let totalEurInvested = 0;
		const assetsObj: Record<string, { amount: number; eurValue: number | null }> = {};

		for (const [asset, data] of aggregatedHoldings) {
			let price = this.getPriceAtTimestamp(priceHistories, asset, timestamp);
			if (price === null && latestPrices) {
				const latest = latestPrices.get(asset);
				if (latest) {
					price = Number(latest.priceEur);
				}
			}
			const eurValue = price !== null ? data.amount * price : null;

			assetsObj[asset] = { amount: data.amount, eurValue };
			totalEurInvested += data.eurInvested;

			if (eurValue !== null) {
				totalEurValue = (totalEurValue || 0) + eurValue;
			} else {
				totalEurValue = null;
			}
		}

		if (totalEurValue === null || Object.keys(assetsObj).length === 0) {
			return null;
		}

		return {
			date: timestamp.toISO() || "",
			totalEurValue,
			totalEurInvested,
			assets: assetsObj,
		};
	}

	async getPortfolioOverview(userId: number, days = 30): Promise<PortfolioOverview> {
		const now = DateTime.utc();
		const startDate = now.minus({ days }).startOf("day");

		const pricesRepo = this.pricesRepository || new PricesRepository(this.dataSource);
		const holdingsByAccount = await this.repository.findLatestByUser(userId);

		if (holdingsByAccount.size === 0) {
			return {
				portfolioHistory: [],
				assets: [],
				accounts: [],
				currentYearStakingRewards: { eurValue: 0, count: 0 },
				totalStakingRewards: { eurValue: 0, count: 0 },
			};
		}

		const allAssets = new Set<string>();
		const aggregatedHoldings = new Map<string, { amount: number; eurInvested: number }>();

		for (const [, holdings] of holdingsByAccount) {
			for (const [asset, h] of holdings) {
				allAssets.add(asset);
				const existing = aggregatedHoldings.get(asset) || { amount: 0, eurInvested: 0 };
				aggregatedHoldings.set(asset, {
					amount: existing.amount + h.amount,
					eurInvested: existing.eurInvested + h.eurInvested,
				});
			}
		}

		const assetList = Array.from(allAssets);
		const priceHistories = await this.getPriceHistoriesHourly(pricesRepo, assetList, startDate, now);
		const latestPrices = await pricesRepo.getLatestPrices(assetList);

		const portfolioHistory = await this.getPortfolioHistoryWithPrices(userId, undefined, { days });

		const assetsOverview: AssetOverview[] = [];

		for (const asset of assetList) {
			const holding = aggregatedHoldings.get(asset);
			if (!holding) continue;

			const latestPrice = latestPrices.get(asset);
			const eurValue = latestPrice ? holding.amount * Number(latestPrice.priceEur) : null;

			const assetHistory = priceHistories.get(asset) || [];
			const positionHistory: { date: string; value: number | null }[] = [];

			for (const point of assetHistory) {
				positionHistory.push({
					date: point.timestamp.toISO() || "",
					value: holding.amount * point.priceEur,
				});
			}

			assetsOverview.push({
				asset,
				amount: holding.amount,
				eurValue,
				eurInvested: holding.eurInvested,
				priceHistory: assetHistory.map(p => ({
					date: p.timestamp.toISO() || "",
					priceEur: p.priceEur,
				})),
				positionHistory,
			});
		}

		assetsOverview.sort((a, b) => (b.eurValue || 0) - (a.eurValue || 0));

		const accountsOverview: AccountOverview[] = [];
		const accountRepo = this.dataSource.getRepository(AccountEntity);

		for (const [accountId, holdings] of holdingsByAccount) {
			const account = await accountRepo.findOne({ where: { id: accountId } });
			if (account) {
				let accountValue: number | null = 0;
				for (const [asset, h] of holdings) {
					const latestPrice = latestPrices.get(asset);
					if (latestPrice) {
						accountValue = (accountValue || 0) + h.amount * Number(latestPrice.priceEur);
					} else {
						accountValue = null;
					}
				}
				accountsOverview.push({
					accountId,
					provider: account.provider,
					eurValue: accountValue,
				});
			}
		}

		const transactionsRepo = new TransactionsRepository(this.dataSource);
		const currentYear = now.year;
		const currentYearStaking = await transactionsRepo.getStakingRewardsByYear(userId, currentYear);
		const totalStaking = await transactionsRepo.getTotalStakingRewards(userId);

		return {
			portfolioHistory,
			assets: assetsOverview,
			accounts: accountsOverview,
			currentYearStakingRewards: currentYearStaking,
			totalStakingRewards: totalStaking,
		};
	}

	async deleteByAccount(userId: number, providerAccountId: number): Promise<void> {
		await this.repository.deleteByAccount(userId, providerAccountId);
	}

	private async calculateHoldings(userId: number, providerAccountId: number): Promise<AssetStat[]> {
		const qb = this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("transaction");

		const stats = await qb
			.select([
				"transaction.asset AS asset",
				"SUM(CASE WHEN transaction.type IN (:sell, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type IN (:buy, :deposit) THEN transaction.eurValue ELSE 0 END) AS eurInvested",
			])
			.where(
				"transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
				{ userId, providerAccountId, sell: TransactionType.sell, withdrawal: TransactionType.withdrawal, buy: TransactionType.buy, deposit: TransactionType.deposit }
			)
			.groupBy("transaction.asset")
			.getRawMany();

		return stats
			.filter((stat) => stat.amount !== null && Number(stat.amount) !== 0)
			.map((stat) => ({
				asset: stat.asset,
				amount: Number(stat.amount) || 0,
				eurInvested: Number(stat.eurInvested) || 0,
				buys: 0,
				sells: 0,
			}));
	}

	private async calculateAllHoldings(userId: number): Promise<Map<number, AssetStat[]>> {
		const qb = this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("transaction");

		const stats = await qb
			.select([
				"transaction.providerAccountId AS providerAccountId",
				"transaction.asset AS asset",
				"SUM(CASE WHEN transaction.type IN (:sell, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type IN (:buy, :deposit) THEN transaction.eurValue ELSE 0 END) AS eurInvested",
			])
			.where("transaction.userId = :userId", { userId, sell: TransactionType.sell, withdrawal: TransactionType.withdrawal, buy: TransactionType.buy, deposit: TransactionType.deposit })
			.groupBy("transaction.providerAccountId, transaction.asset")
			.getRawMany();

		const result = new Map<number, AssetStat[]>();

		for (const stat of stats) {
			const amount = Number(stat.amount) || 0;
			if (amount === 0) continue;

			const providerAccountId = Number(stat.providerAccountId);
			if (!result.has(providerAccountId)) {
				result.set(providerAccountId, []);
			}

			result.get(providerAccountId)!.push({
				asset: stat.asset,
				amount,
				eurInvested: Number(stat.eurInvested) || 0,
				buys: 0,
				sells: 0,
			});
		}

		return result;
	}

	private async getPriceHistoriesHourly(
		pricesRepo: PricesRepository,
		assets: string[],
		startDate: DateTime,
		endDate: DateTime
	): Promise<Map<string, { timestamp: DateTime; priceEur: number }[]>> {
		const result = new Map<string, { timestamp: DateTime; priceEur: number }[]>();

		for (const asset of assets) {
			const prices = await pricesRepo.getPricesInTimeRange(asset, startDate, endDate);
			result.set(asset, prices.map(p => ({
				timestamp: p.fetchedAt,
				priceEur: Number(p.priceEur),
			})));
		}

		return result;
	}

	private getPriceAtTimestamp(
		priceHistories: Map<string, { timestamp: DateTime; priceEur: number }[]>,
		asset: string,
		timestamp: DateTime
	): number | null {
		const history = priceHistories.get(asset);
		if (!history || history.length === 0) return null;

		const ts = timestamp.toMillis();
		let closest: { timestamp: DateTime; priceEur: number } | null = null;

		for (const point of history) {
			if (point.timestamp.toMillis() <= ts) {
				if (!closest || point.timestamp.toMillis() > closest.timestamp.toMillis()) {
					closest = point;
				}
			}
		}

		return closest?.priceEur ?? null;
	}
}
