import { injectable, inject } from "inversify";
import type { AssetStat } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { TYPES } from "../../di/types.js";
import { AssetHoldingsRepository, type AssetHoldingData, type HoldingState } from "./asset-holdings.repository.js";
import { PricesRepository } from "../prices/prices.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { AccountsRepository } from "../accounts/accounts.repository.js";
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

export interface PriceChangeStats {
	absolute: number;
	relative: number;
}

export interface AssetOverview {
	asset: string;
	amount: number;
	eurValue: number | null;
	eurInvested: number;
	priceHistory: AssetPriceHistoryPoint[];
	positionHistory: { date: string; value: number | null }[];
	priceChanges: {
		day: PriceChangeStats | null;
		week: PriceChangeStats | null;
		month: PriceChangeStats | null;
	};
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

@injectable()
export class AssetHoldingsService {
	private holdingsRepository: AssetHoldingsRepository;
	private transactionsRepository: TransactionsRepository;
	private accountsRepository: AccountsRepository;
	private pricesRepository: PricesRepository;

	constructor(
		@inject(TYPES.AssetHoldingsRepository) holdingsRepository: AssetHoldingsRepository,
		@inject(TYPES.TransactionsRepository) transactionsRepository: TransactionsRepository,
		@inject(TYPES.AccountsRepository) accountsRepository: AccountsRepository,
		@inject(TYPES.PricesRepository) pricesRepository: PricesRepository
	) {
		this.holdingsRepository = holdingsRepository;
		this.transactionsRepository = transactionsRepository;
		this.accountsRepository = accountsRepository;
		this.pricesRepository = pricesRepository;
	}

	async getCurrentHoldings(userId: number, providerAccountId: number): Promise<AssetStat[]> {
		const holdings = await this.holdingsRepository.findLatestByAccount(userId, providerAccountId);
		
		if (holdings.size > 0) {
			return Array.from(holdings.values()).map(h => ({
				asset: h.asset,
				amount: h.amount,
				eurInvested: h.eurInvested,
				buys: 0,
				sells: 0,
			}));
		}

		return this.transactionsRepository.calculateHoldingsByAccount(userId, providerAccountId);
	}

	async getAllCurrentHoldings(userId: number): Promise<Map<number, AssetStat[]>> {
		const holdingsByAccount = await this.holdingsRepository.findLatestByUser(userId);
		
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

		return this.transactionsRepository.calculateAllHoldingsByUser(userId);
	}

	async rebuildHoldings(userId: number, providerAccountId: number): Promise<void> {
		logger.info({
			message: "Rebuilding asset holdings",
			userId,
			providerAccountId,
		});

		await this.holdingsRepository.deleteByAccount(userId, providerAccountId);

		const transactions = await this.transactionsRepository.findTransactionsByAccountOrdered(
			userId,
			providerAccountId
		);

		if (transactions.length === 0) {
			return;
		}

		const typeBreakdown = transactions.reduce((acc, tx) => {
			acc[tx.type] = (acc[tx.type] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);
		
		const eurValueByType = transactions.reduce((acc, tx) => {
			acc[tx.type] = (acc[tx.type] || 0) + Number(tx.eurValue);
			return acc;
		}, {} as Record<string, number>);

		logger.info({
			message: "RebuildHoldings: fetched transactions",
			count: transactions.length,
			typeBreakdown,
			eurValueByType,
			enumValues: {
				buy: TransactionType.buy,
				deposit: TransactionType.deposit,
				sell: TransactionType.sell,
				withdrawal: TransactionType.withdrawal,
				reward: TransactionType.reward,
			},
		});

		const holdingsByAsset = new Map<string, { amount: number; eurInvested: number }>();
		const holdingData: AssetHoldingData[] = [];

		let totalEurInvestedDelta = 0;

		for (const tx of transactions) {
			const current = holdingsByAsset.get(tx.asset) || { amount: 0, eurInvested: 0 };
			
			const quantity = tx.type === TransactionType.sell || tx.type === TransactionType.withdrawal
				? -Math.abs(tx.quantity)
				: Math.abs(tx.quantity);
			
			let eurInvestedDelta = 0;
			const typeMatchesBuy = tx.type === TransactionType.buy;
			const typeMatchesDeposit = tx.type === TransactionType.deposit;
			
		if (typeMatchesBuy || typeMatchesDeposit) {
			eurInvestedDelta = Number(tx.eurValue);
			totalEurInvestedDelta += eurInvestedDelta;
				
				logger.debug({
					message: "RebuildHoldings: adding eurInvested",
					externalId: tx.externalId,
					type: tx.type,
					typeString: JSON.stringify(tx.type),
					asset: tx.asset,
					eurValue: Number(tx.eurValue),
					eurInvestedDelta,
					typeMatchesBuy,
					typeMatchesDeposit,
					runningTotal: totalEurInvestedDelta,
				});
			} else if ((tx.type === TransactionType.sell || tx.type === TransactionType.withdrawal) && current.amount > 0) {
				eurInvestedDelta = -Number(current.eurInvested) * (Math.abs(tx.quantity) / current.amount);
				totalEurInvestedDelta += eurInvestedDelta;
				
				logger.debug({
					message: "RebuildHoldings: reducing eurInvested",
					externalId: tx.externalId,
					type: tx.type,
					asset: tx.asset,
					eurInvestedDelta,
					runningTotal: totalEurInvestedDelta,
				});
			} else {
				logger.debug({
					message: "RebuildHoldings: no eurInvested change",
					externalId: tx.externalId,
					type: tx.type,
					typeString: JSON.stringify(tx.type),
					asset: tx.asset,
					eurValue: Number(tx.eurValue),
					typeMatchesBuy,
					typeMatchesDeposit,
				});
			}

			const newAmount = current.amount + quantity;
			const newEurInvested = Number(current.eurInvested) + eurInvestedDelta;

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

		logger.info({
			message: "RebuildHoldings: final totals",
			totalEurInvestedDelta,
			holdingsByAsset: Array.from(holdingsByAsset.entries()).map(([asset, data]) => ({
				asset,
				amount: data.amount,
				eurInvested: data.eurInvested,
			})),
		});

		await this.holdingsRepository.saveMany(holdingData);
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

		const existingHoldings = await this.holdingsRepository.findLatestByAccount(userId, providerAccountId);
		if (existingHoldings.size === 0) {
			logger.info({
				message: "No existing holdings found, rebuilding all holdings",
				userId,
				providerAccountId,
			});
			return this.rebuildHoldings(userId, providerAccountId);
		}

		await this.holdingsRepository.deleteByAccountFromTimestamp(userId, providerAccountId, fromTimestamp);

		const transactions = await this.transactionsRepository.findTransactionsByAccountFromTimestamp(
			userId,
			providerAccountId,
			fromTimestamp
		);

		if (transactions.length === 0) {
			return;
		}

		const holdingsBefore = await this.holdingsRepository.getHoldingsUpToTimestamp(
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
			
			let eurInvestedDelta = 0;
			if (tx.type === TransactionType.buy || tx.type === TransactionType.deposit) {
				eurInvestedDelta = Number(tx.eurValue);
			} else if ((tx.type === TransactionType.sell || tx.type === TransactionType.withdrawal) && current.amount > 0) {
				eurInvestedDelta = -Number(current.eurInvested) * (Math.abs(tx.quantity) / current.amount);
			}

			const newAmount = current.amount + quantity;
			const newEurInvested = Number(current.eurInvested) + eurInvestedDelta;

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

		await this.holdingsRepository.saveMany(holdingData);
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

		const currentHoldings = providerAccountId
			? await this.holdingsRepository.findLatestByAccount(userId, providerAccountId)
			: await this.holdingsRepository.findLatestByUser(userId);

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
		const priceHistories = await this.getPriceHistoriesHourly(assetList, startDate, endDate);
		const latestPrices = await this.pricesRepository.getLatestPrices(assetList);

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
				await this.holdingsRepository.findLatestByAccount(userId, providerAccountId)
			);
		}
		return this.aggregateHoldingsByAccount(await this.holdingsRepository.findLatestByUser(userId));
	}

	private async getAggregatedHoldingsAtTimestamp(
		userId: number,
		providerAccountId: number | undefined,
		timestamp: DateTime
	): Promise<Map<string, { amount: number; eurInvested: number }>> {
		if (providerAccountId) {
			return this.holdingsMapToAggregated(
				await this.holdingsRepository.getHoldingsUpToTimestamp(userId, providerAccountId, timestamp)
			);
		}
		return this.aggregateHoldingsByAccount(
			await this.holdingsRepository.getAllHoldingsUpToTimestamp(userId, timestamp)
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
			let price: number | null = null;
			if (latestPrices) {
				const latest = latestPrices.get(asset);
				if (latest) {
					price = Number(latest.priceEur);
				}
			}
			if (price === null) {
				price = this.getPriceAtTimestamp(priceHistories, asset, timestamp);
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

		const holdingsByAccount = await this.holdingsRepository.findLatestByUser(userId);

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
		const priceHistories = await this.getPriceHistoriesHourly(assetList, startDate, now);
		const latestPrices = await this.pricesRepository.getLatestPrices(assetList);

		const portfolioHistory = await this.getPortfolioHistoryWithPrices(userId, undefined, { days });

		const assetsOverview: AssetOverview[] = [];

		for (const asset of assetList) {
			const holding = aggregatedHoldings.get(asset);
			if (!holding) continue;

			const latestPrice = latestPrices.get(asset);
			const eurValue = latestPrice ? holding.amount * Number(latestPrice.priceEur) : null;
			const currentPrice = latestPrice ? Number(latestPrice.priceEur) : 0;

			const assetHistory = priceHistories.get(asset) || [];
			const positionHistory: { date: string; value: number | null }[] = [];

			for (const point of assetHistory) {
				positionHistory.push({
					date: point.timestamp.toISO() || "",
					value: holding.amount * point.priceEur,
				});
			}

			const priceChanges = await this.calculatePriceChanges(asset, currentPrice);

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
				priceChanges,
			});
		}

		assetsOverview.sort((a, b) => (b.eurValue || 0) - (a.eurValue || 0));

		const accountsOverview: AccountOverview[] = [];

		for (const [accountId, holdings] of holdingsByAccount) {
			const account = await this.accountsRepository.findById(userId, accountId);
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

		const currentYear = now.year;
		const currentYearStaking = await this.transactionsRepository.getStakingRewardsByYear(userId, currentYear);
		const totalStaking = await this.transactionsRepository.getTotalStakingRewards(userId);

		return {
			portfolioHistory,
			assets: assetsOverview,
			accounts: accountsOverview,
			currentYearStakingRewards: currentYearStaking,
			totalStakingRewards: totalStaking,
		};
	}

	async getAccountAssetOverview(userId: number, accountId: number, days = 30): Promise<AssetOverview[]> {
		const now = DateTime.utc();
		const startDate = now.minus({ days }).startOf("day");

		const holdings = await this.holdingsRepository.findLatestByAccount(userId, accountId);

		if (holdings.size === 0) {
			return [];
		}

		const assetList = Array.from(holdings.keys());
		const priceHistories = await this.getPriceHistoriesHourly(assetList, startDate, now);
		const latestPrices = await this.pricesRepository.getLatestPrices(assetList);

		const assetsOverview: AssetOverview[] = [];

		for (const [asset, holding] of holdings) {
			const latestPrice = latestPrices.get(asset);
			const eurValue = latestPrice ? holding.amount * Number(latestPrice.priceEur) : null;
			const currentPrice = latestPrice ? Number(latestPrice.priceEur) : 0;

			const assetHistory = priceHistories.get(asset) || [];
			const positionHistory: { date: string; value: number | null }[] = [];

			for (const point of assetHistory) {
				positionHistory.push({
					date: point.timestamp.toISO() || "",
					value: holding.amount * point.priceEur,
				});
			}

			const priceChanges = await this.calculatePriceChanges(asset, currentPrice);

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
				priceChanges,
			});
		}

		assetsOverview.sort((a, b) => (b.eurValue || 0) - (a.eurValue || 0));

		return assetsOverview;
	}

	async deleteByAccount(userId: number, providerAccountId: number): Promise<void> {
		await this.holdingsRepository.deleteByAccount(userId, providerAccountId);
	}

	private async getPriceHistoriesHourly(
		assets: string[],
		startDate: DateTime,
		endDate: DateTime
	): Promise<Map<string, { timestamp: DateTime; priceEur: number }[]>> {
		const result = new Map<string, { timestamp: DateTime; priceEur: number }[]>();

		for (const asset of assets) {
			const prices = await this.pricesRepository.getPriceHistory(asset, startDate, endDate);
			result.set(asset, prices.map(p => ({
				timestamp: p.date,
				priceEur: p.priceEur,
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

	private async calculatePriceChanges(
		asset: string,
		currentPrice: number
	): Promise<{ day: PriceChangeStats | null; week: PriceChangeStats | null; month: PriceChangeStats | null }> {
		const now = DateTime.utc();
		
		const dayAgoPrice = await this.pricesRepository.getPriceAtOrBefore(asset, now.minus({ hours: 24 }));
		const weekAgoPrice = await this.pricesRepository.getPriceAtOrBefore(asset, now.minus({ days: 7 }));
		const monthAgoPrice = await this.pricesRepository.getPriceAtOrBefore(asset, now.minus({ days: 30 }));

		return {
			day: this.calculateChange(currentPrice, dayAgoPrice?.priceEur),
			week: this.calculateChange(currentPrice, weekAgoPrice?.priceEur),
			month: this.calculateChange(currentPrice, monthAgoPrice?.priceEur),
		};
	}

	private calculateChange(currentPrice: number, pastPrice: number | undefined): PriceChangeStats | null {
		if (pastPrice === undefined || pastPrice === null) return null;
		
		const absolute = currentPrice - pastPrice;
		const relative = (absolute / pastPrice) * 100;
		
		return { absolute, relative };
	}
}
