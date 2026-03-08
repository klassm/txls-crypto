import type { DataSource } from "typeorm";
import type { AssetStat } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { DateTime } from "luxon";
import { PortfolioSnapshotsRepository, type PortfolioSnapshotData } from "./portfolio-snapshots.repository.js";
import { PortfolioSnapshotEntity } from "./portfolio-snapshot.entity.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { logger } from "../../common/logger.js";

interface DailyAssetData {
	asset: string;
	amount: number;
	eurInvested: number;
	buyCount: number;
	sellCount: number;
}

export class PortfolioSnapshotsService {
	private repository: PortfolioSnapshotsRepository;
	private dataSource: DataSource;

	constructor(dataSource: DataSource, repository?: PortfolioSnapshotsRepository) {
		this.dataSource = dataSource;
		this.repository = repository || new PortfolioSnapshotsRepository(dataSource);
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

		await this.repository.deleteByAccount(userId, providerAccountId);

		const earliestTransaction = await this.findEarliestTransaction(userId, providerAccountId);
		if (!earliestTransaction) {
			return;
		}

		await this.rebuildFromDate(userId, providerAccountId, earliestTransaction);
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
				"SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type = :buy THEN transaction.eurValue ELSE 0 END) AS eurInvested",
				"SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
				"SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
			])
			.where(
				"transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
				{ userId, providerAccountId, buy: TransactionType.buy, sell: TransactionType.sell },
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
				"SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
				"SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
			])
			.where(
				"transaction.userId = :userId AND transaction.providerAccountId = :providerAccountId",
				{ userId, providerAccountId, buy: TransactionType.buy, sell: TransactionType.sell },
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
				"SUM(CASE WHEN transaction.type = :sell THEN -ABS(transaction.quantity) ELSE ABS(transaction.quantity) END) AS amount",
				"SUM(CASE WHEN transaction.type = :buy THEN 1 ELSE 0 END) AS buys",
				"SUM(CASE WHEN transaction.type = :sell THEN 1 ELSE 0 END) AS sells",
			])
			.where("transaction.userId = :userId", { userId, buy: TransactionType.buy, sell: TransactionType.sell })
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
