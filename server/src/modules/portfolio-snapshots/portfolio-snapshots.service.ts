import type { DataSource } from "typeorm";
import type { AssetStat } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { PortfolioSnapshotsRepository, type PortfolioSnapshotData } from "./portfolio-snapshots.repository.js";
import { PortfolioSnapshotEntity } from "./portfolio-snapshot.entity.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { AccountEntity } from "../accounts/account.entity.js";
import { PricesRepository } from "../prices/prices.repository.js";
import { logger } from "../../common/logger.js";

interface DailyAssetData {
	asset: string;
	amount: number;
	eurInvested: number;
	buyCount: number;
	sellCount: number;
}

export interface PortfolioHistoryPoint {
	date: string;
	totalEurValue: number | null;
	assets: Record<string, { amount: number; eurValue: number | null }>;
}

export interface PortfolioHistoryOptions {
	days?: number;
	includeToday?: boolean;
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

export interface PortfolioOverview {
	portfolioHistory: PortfolioHistoryPoint[];
	assets: AssetOverview[];
	accounts: AccountOverview[];
}

export class PortfolioSnapshotsService {
	private repository: PortfolioSnapshotsRepository;
	private dataSource: DataSource;
	private pricesRepository?: PricesRepository;

	constructor(
		dataSource: DataSource,
		repository?: PortfolioSnapshotsRepository,
		pricesRepository?: PricesRepository
	) {
		this.dataSource = dataSource;
		this.repository = repository || new PortfolioSnapshotsRepository(dataSource);
		this.pricesRepository = pricesRepository;
	}

	async getCurrentHoldings(userId: number, providerAccountId: number): Promise<AssetStat[]> {
		const snapshots = await this.repository.findLatestByAccount(userId, providerAccountId);

		if (snapshots.length > 0) {
			return this.snapshotsToAssetStats(snapshots);
		}

		return this.calculateHoldings(userId, providerAccountId);
	}

	async getAllCurrentHoldings(userId: number): Promise<Map<number, AssetStat[]>> {
		const snapshots = await this.repository.findLatestByUser(userId);

		if (snapshots.size > 0) {
			const result = new Map<number, AssetStat[]>();
			for (const [accountId, accountSnapshots] of snapshots) {
				result.set(accountId, this.snapshotsToAssetStats(accountSnapshots));
			}
			return result;
		}

		return this.calculateAllHoldings(userId);
	}

	async rebuildFromDate(
		userId: number,
		providerAccountId: number,
		fromDate: DateTime,
	): Promise<void> {
		logger.info({
			message: "Rebuilding portfolio snapshots from date",
			userId,
			providerAccountId,
			fromDate: fromDate.toISODate(),
		});

		await this.repository.deleteByAccountAndDateRange(userId, providerAccountId, fromDate);

		const earliestTransaction = await this.findEarliestTransaction(userId, providerAccountId, fromDate);
		if (!earliestTransaction) {
			return;
		}

		const now = DateTime.utc();
		let currentDate = earliestTransaction.startOf("day");

		while (currentDate <= now) {
			await this.buildSnapshotForDay(userId, providerAccountId, currentDate);
			currentDate = currentDate.plus({ days: 1 });
		}
	}

	async rebuildAll(userId: number, providerAccountId: number): Promise<void> {
		logger.info({
			message: "Rebuilding all portfolio snapshots",
			userId,
			providerAccountId,
		});

		await this.deleteByAccount(userId, providerAccountId);

		const earliestTransaction = await this.findEarliestTransaction(userId, providerAccountId);
		if (!earliestTransaction) {
			return;
		}

		await this.rebuildFromDate(userId, providerAccountId, earliestTransaction);
	}

	async deleteByAccount(userId: number, providerAccountId: number): Promise<void> {
		await this.repository.deleteByAccount(userId, providerAccountId);
	}

	async buildDailySnapshotsForAllAccounts(): Promise<void> {
		logger.info({ message: "Building daily snapshots for all accounts" });

		const accounts = await this.getAllAccountsWithTransactions();
		
		for (const { userId, providerAccountId } of accounts) {
			try {
				await this.buildSnapshotForDay(userId, providerAccountId, DateTime.utc().startOf("day"));
			} catch (error) {
				logger.error({ error, userId, providerAccountId }, "Failed to build daily snapshot");
			}
		}
	}

	async getPortfolioHistory(
		userId: number,
		providerAccountId?: number,
		startDate?: DateTime,
		endDate?: DateTime,
	): Promise<PortfolioSnapshotEntity[]> {
		const start = startDate || DateTime.utc().minus({ days: 30 }).startOf("day");
		const end = endDate || DateTime.utc().startOf("day");

		if (providerAccountId) {
			return this.repository.findByAccountAndDateRange(userId, providerAccountId, start, end);
		}

		return this.repository.findByUserAndDateRange(userId, start, end);
	}

	async getPortfolioHistoryWithPrices(
		userId: number,
		providerAccountId?: number,
		options: PortfolioHistoryOptions = {}
	): Promise<PortfolioHistoryPoint[]> {
		const { days = 30, includeToday = true } = options;
		const endDate = DateTime.utc().endOf("day");
		const startDate = endDate.minus({ days }).startOf("day");

		const snapshots = await this.getPortfolioHistory(userId, providerAccountId, startDate, endDate);
		const pricesRepo = this.pricesRepository || new PricesRepository(this.dataSource);

		const snapshotsByDate = new Map<string, Map<string, { amount: number; eurValue: number | null }>>();

		for (const snapshot of snapshots) {
			const dateKey = snapshot.date.toISODate() || "";
			if (!snapshotsByDate.has(dateKey)) {
				snapshotsByDate.set(dateKey, new Map());
			}

			if (providerAccountId) {
				const pricesForDate = await pricesRepo.getPriceForDate(snapshot.asset, snapshot.date);
				const eurValue = pricesForDate ? Number(snapshot.amount) * Number(pricesForDate.priceEur) : null;

				snapshotsByDate.get(dateKey)!.set(snapshot.asset, {
					amount: Number(snapshot.amount),
					eurValue,
				});
			} else {
				const existing = snapshotsByDate.get(dateKey)!.get(snapshot.asset);
				const newAmount = (existing?.amount || 0) + Number(snapshot.amount);

				const pricesForDate = await pricesRepo.getPriceForDate(snapshot.asset, snapshot.date);
				const eurValue = pricesForDate ? newAmount * Number(pricesForDate.priceEur) : null;

				snapshotsByDate.get(dateKey)!.set(snapshot.asset, {
					amount: newAmount,
					eurValue,
				});
			}
		}

		const todayKey = endDate.toISODate() || "";
		if (includeToday && !snapshotsByDate.has(todayKey)) {
			const currentHoldings = providerAccountId
				? new Map([[providerAccountId, await this.getCurrentHoldings(userId, providerAccountId)]])
				: await this.getAllCurrentHoldings(userId);

			const todayAssets = new Map<string, { amount: number; eurValue: number | null }>();

			for (const [_accountId, holdings] of currentHoldings) {
				for (const holding of holdings) {
					const existing = todayAssets.get(holding.asset);
					const newAmount = (existing?.amount || 0) + holding.amount;

					const latestPrice = await pricesRepo.getLatestPrice(holding.asset);
					const eurValue = latestPrice ? newAmount * Number(latestPrice.priceEur) : null;

					todayAssets.set(holding.asset, {
						amount: newAmount,
						eurValue,
					});
				}
			}

			if (todayAssets.size > 0) {
				snapshotsByDate.set(todayKey, todayAssets);
			}
		}

		const result: PortfolioHistoryPoint[] = [];

		for (const [date, assets] of snapshotsByDate) {
			let totalEurValue: number | null = 0;
			const assetsObj: Record<string, { amount: number; eurValue: number | null }> = {};

			for (const [asset, data] of assets) {
				assetsObj[asset] = data;
				if (data.eurValue !== null) {
					totalEurValue = (totalEurValue || 0) + data.eurValue;
				} else {
					totalEurValue = null;
				}
			}

			if (totalEurValue !== null) {
				result.push({ date, totalEurValue, assets: assetsObj });
			}
		}

		result.sort((a, b) => a.date.localeCompare(b.date));

		return result;
	}

	async getPortfolioOverview(
		userId: number,
		days = 30
	): Promise<PortfolioOverview> {
		const endDate = DateTime.utc().endOf("day");
		const startDate = endDate.minus({ days }).startOf("day");

		const snapshots = await this.repository.findByUserAndDateRange(userId, startDate, endDate);
		const pricesRepo = this.pricesRepository || new PricesRepository(this.dataSource);

		const allAssets = new Set<string>();
		const snapshotsByDate = new Map<string, Map<string, { amount: number; eurInvested: number }>>();

		for (const snapshot of snapshots) {
			allAssets.add(snapshot.asset);
			const dateKey = snapshot.date.toISODate() || "";
			if (!snapshotsByDate.has(dateKey)) {
				snapshotsByDate.set(dateKey, new Map());
			}

			const existing = snapshotsByDate.get(dateKey)!.get(snapshot.asset);
			const newAmount = (existing?.amount || 0) + Number(snapshot.amount);
			const newEurInvested = (existing?.eurInvested || 0) + Number(snapshot.eurInvested);

			snapshotsByDate.get(dateKey)!.set(snapshot.asset, {
				amount: newAmount,
				eurInvested: newEurInvested,
			});
		}

		const todayKey = endDate.toISODate() || "";
		if (!snapshotsByDate.has(todayKey)) {
			const currentHoldings = await this.getAllCurrentHoldings(userId);
			const todayAssets = new Map<string, { amount: number; eurInvested: number }>();

			for (const [_accountId, holdings] of currentHoldings) {
				for (const holding of holdings) {
					allAssets.add(holding.asset);
					const existing = todayAssets.get(holding.asset);
					const newAmount = (existing?.amount || 0) + holding.amount;

					todayAssets.set(holding.asset, {
						amount: newAmount,
						eurInvested: existing?.eurInvested || 0,
					});
				}
			}

			if (todayAssets.size > 0) {
				snapshotsByDate.set(todayKey, todayAssets);
			}
		}

		const assetList = Array.from(allAssets);
		const priceHistories = await pricesRepo.getPriceHistoryBatch(assetList, startDate, endDate);

		const portfolioHistory: PortfolioHistoryPoint[] = [];

		for (const [date, assets] of snapshotsByDate) {
			let totalEurValue: number | null = 0;
			const assetsObj: Record<string, { amount: number; eurValue: number | null }> = {};

			for (const [asset, data] of assets) {
				const assetHistory = priceHistories.get(asset);
				const priceForDate = assetHistory?.find(p => p.date.toISODate() === date);
				const eurValue = priceForDate ? data.amount * priceForDate.priceEur : null;

				assetsObj[asset] = { amount: data.amount, eurValue };
				
				if (eurValue !== null) {
					totalEurValue = (totalEurValue || 0) + eurValue;
				} else {
					totalEurValue = null;
				}
			}

			if (totalEurValue !== null) {
				portfolioHistory.push({ date, totalEurValue, assets: assetsObj });
			}
		}

		portfolioHistory.sort((a, b) => a.date.localeCompare(b.date));

		const latest = portfolioHistory[portfolioHistory.length - 1];
		const assetsOverview: AssetOverview[] = [];

		for (const asset of assetList) {
			const assetHistory = priceHistories.get(asset) || [];
			const latestData = latest?.assets[asset];
			const amount = latestData?.amount ?? 0;
			const eurValue = latestData?.eurValue ?? null;

			let totalEurInvested = 0;
			for (const [, assets] of snapshotsByDate) {
				const assetData = assets.get(asset);
				if (assetData) {
					totalEurInvested = assetData.eurInvested;
				}
			}

			const positionHistory: { date: string; value: number | null }[] = [];
			for (const [date, assets] of snapshotsByDate) {
				const assetData = assets.get(asset);
				if (assetData) {
					const priceForDate = assetHistory.find(p => p.date.toISODate() === date);
					const value = priceForDate ? assetData.amount * priceForDate.priceEur : null;
					positionHistory.push({ date, value });
				}
			}
			positionHistory.sort((a, b) => a.date.localeCompare(b.date));

			assetsOverview.push({
				asset,
				amount,
				eurValue,
				eurInvested: totalEurInvested,
				priceHistory: assetHistory.map(p => ({
					date: p.date.toISODate() || "",
					priceEur: p.priceEur,
				})),
				positionHistory,
			});
		}

		assetsOverview.sort((a, b) => (b.eurValue || 0) - (a.eurValue || 0));

		const accountsOverview: AccountOverview[] = [];
		const accountRepo = this.dataSource.getRepository(AccountEntity);
		const currentHoldings = await this.getAllCurrentHoldings(userId);
		
		for (const [accountId, holdings] of currentHoldings) {
			const account = await accountRepo.findOne({ where: { id: accountId } });
			if (account) {
				let accountValue: number | null = 0;
				for (const holding of holdings) {
					const latestPrice = await pricesRepo.getLatestPrice(holding.asset);
					if (latestPrice) {
						accountValue = (accountValue || 0) + holding.amount * Number(latestPrice.priceEur);
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

		return {
			portfolioHistory,
			assets: assetsOverview,
			accounts: accountsOverview,
		};
	}

	private async buildSnapshotForDay(
		userId: number,
		providerAccountId: number,
		date: DateTime,
	): Promise<void> {
		const dayEnd = date.endOf("day");
		const dayEndMillis = dayEnd.toMillis();

		const assetData = await this.calculateHoldingsUpTo(
			userId,
			providerAccountId,
			dayEndMillis,
		);

		const snapshotData: PortfolioSnapshotData[] = assetData
			.filter((data) => data.amount > 0)
			.map((data) => ({
				userId,
				providerAccountId,
				asset: data.asset,
				date: date,
				amount: data.amount,
				eurInvested: data.eurInvested,
				buyCount: data.buyCount,
				sellCount: data.sellCount,
			}));

		if (snapshotData.length > 0) {
			await this.repository.saveMany(snapshotData);
		}
	}

	private async calculateHoldingsUpTo(
		userId: number,
		providerAccountId: number,
		timestampLimit: number,
	): Promise<DailyAssetData[]> {
		const qb = this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("transaction");

		const stats = await qb
			.select([
				"transaction.asset AS asset",
				"SUM(CASE WHEN transaction.type IN (:sell, :stake, :transferOut, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type = :buy THEN transaction.eurValue ELSE 0 END) AS eurInvested",
				"SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
				"SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
			])
			.where(
				"transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
				{ userId, providerAccountId, buy: TransactionType.buy, sell: TransactionType.sell, stake: TransactionType.stake, transferOut: TransactionType.transfer_out, withdrawal: TransactionType.withdrawal },
			)
			.andWhere("transaction.timestamp <= :timestampLimit", { timestampLimit })
			.groupBy("transaction.asset")
			.getRawMany();

		return stats.map((stat) => ({
			asset: stat.asset,
			amount: Number(stat.amount) || 0,
			eurInvested: Number(stat.eurInvested) || 0,
			buyCount: Number(stat.buys) || 0,
			sellCount: Number(stat.sells) || 0,
		}));
	}

	private async calculateHoldings(
		userId: number,
		providerAccountId: number,
	): Promise<AssetStat[]> {
		const qb = this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("transaction");

		const stats = await qb
			.select([
				"transaction.asset AS asset",
				"SUM(CASE WHEN transaction.type IN (:sell, :stake, :transferOut, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
				"SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
			])
			.where(
				"transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
				{ userId, providerAccountId, buy: TransactionType.buy, sell: TransactionType.sell, stake: TransactionType.stake, transferOut: TransactionType.transfer_out, withdrawal: TransactionType.withdrawal },
			)
			.groupBy("transaction.asset")
			.getRawMany();

		return stats
			.filter((stat) => stat.amount !== null && Number(stat.amount) !== 0)
			.map((stat) => ({
				asset: stat.asset,
				amount: Number(stat.amount) || 0,
				buys: Number(stat.buys) || 0,
				sells: Number(stat.sells) || 0,
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
				"SUM(CASE WHEN transaction.type IN (:sell, :stake, :transferOut, :withdrawal) THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
				"SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
			])
			.where("transaction.userId = :userId", { userId, buy: TransactionType.buy, sell: TransactionType.sell, stake: TransactionType.stake, transferOut: TransactionType.transfer_out, withdrawal: TransactionType.withdrawal })
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
				buys: Number(stat.buys) || 0,
				sells: Number(stat.sells) || 0,
			});
		}

		return result;
	}

	private async getAllAccountsWithTransactions(): Promise<{ userId: number; providerAccountId: number }[]> {
		const qb = this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("transaction");

		const results = await qb
			.select([
				"transaction.userId AS userId",
				"transaction.providerAccountId AS providerAccountId",
			])
			.distinct(true)
			.getRawMany();

		return results.map((r) => ({
			userId: Number(r.userId),
			providerAccountId: Number(r.providerAccountId),
		}));
	}

	private async findEarliestTransaction(
		userId: number,
		providerAccountId: number,
		fromDate?: DateTime,
	): Promise<DateTime | null> {
		const qb = this.dataSource
			.getRepository(TransactionEntity)
			.createQueryBuilder("transaction");

		let query = qb
			.where(
				"transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
				{ userId, providerAccountId },
			)
			.orderBy("transaction.timestamp", "ASC")
			.select("transaction.timestamp");

		if (fromDate) {
			query = query.andWhere("transaction.timestamp >= :fromDate", {
				fromDate: fromDate.toMillis(),
			});
		}

		const transaction = await query.getOne();

		if (!transaction) {
			return null;
		}

		const dt = transaction.timestamp as DateTime;
		return dt.startOf("day");
	}

	private snapshotsToAssetStats(snapshots: PortfolioSnapshotEntity[]): AssetStat[] {
		return snapshots.map((s) => ({
			asset: s.asset,
			amount: s.amount,
			buys: s.buyCount,
			sells: s.sellCount,
		}));
	}
}
