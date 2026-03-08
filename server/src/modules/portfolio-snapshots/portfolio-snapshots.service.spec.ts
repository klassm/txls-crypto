import { describe, it, expect, beforeEach, vi } from "vitest";
import { PortfolioSnapshotsService } from "./portfolio-snapshots.service.js";
import { PortfolioSnapshotsRepository, type PortfolioSnapshotData } from "./portfolio-snapshots.repository.js";
import { PortfolioSnapshotEntity } from "./portfolio-snapshot.entity.js";
import type { DataSource } from "typeorm";
import { DateTime } from "luxon";

describe("PortfolioSnapshotsService", () => {
	let service: PortfolioSnapshotsService;
	let mockRepository: PortfolioSnapshotsRepository;
	let mockDataSource: DataSource;

	const createMockSnapshot = (overrides: Partial<PortfolioSnapshotEntity> = {}): PortfolioSnapshotEntity => {
		const snapshot = new PortfolioSnapshotEntity();
		snapshot.id = 1;
		snapshot.userId = 1;
		snapshot.providerAccountId = 1;
		snapshot.asset = "BTC";
		snapshot.date = DateTime.utc(2024, 6, 15);
		snapshot.amount = 1.5;
		snapshot.eurInvested = 50000;
		snapshot.buyCount = 2;
		snapshot.sellCount = 0;
		snapshot.createdAt = DateTime.now();
		snapshot.updatedAt = DateTime.now();
		Object.assign(snapshot, overrides);
		return snapshot;
	};

	beforeEach(() => {
		mockRepository = {
			findLatestByAccount: vi.fn(),
			findLatestByUser: vi.fn(),
			findByAccountAndDateRange: vi.fn(),
			findByUserAndDateRange: vi.fn(),
			findDistinctDates: vi.fn(),
			deleteByAccountAndDateRange: vi.fn(),
			save: vi.fn(),
			saveMany: vi.fn(),
			deleteByAccount: vi.fn(),
		} as any;

		mockDataSource = {
			getRepository: vi.fn().mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					andWhere: vi.fn().mockReturnThis(),
					groupBy: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					getRawMany: vi.fn().mockResolvedValue([]),
					getOne: vi.fn().mockResolvedValue(null),
				}),
			}),
		} as any;

		service = new PortfolioSnapshotsService(mockDataSource, mockRepository);
	});

	describe("getCurrentHoldings", () => {
		it("should return holdings from latest snapshot when exists", async () => {
			const mockSnapshots = [
				createMockSnapshot({ asset: "BTC", amount: 1.5, buyCount: 2, sellCount: 0 }),
				createMockSnapshot({ asset: "ETH", amount: 2.0, buyCount: 1, sellCount: 0 }),
			];
			vi.mocked(mockRepository.findLatestByAccount).mockResolvedValue(mockSnapshots);

			const result = await service.getCurrentHoldings(1, 1);

			expect(mockRepository.findLatestByAccount).toHaveBeenCalledWith(1, 1);
			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({ asset: "BTC", amount: 1.5, buys: 2, sells: 0 });
			expect(result[1]).toMatchObject({ asset: "ETH", amount: 2.0, buys: 1, sells: 0 });
		});

		it("should calculate holdings when no snapshot exists", async () => {
			vi.mocked(mockRepository.findLatestByAccount).mockResolvedValue([]);

			const mockQueryBuilder = {
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockReturnThis(),
				getRawMany: vi.fn().mockResolvedValue([
					{ asset: "BTC", amount: 1.5, buys: 2, sells: 0 },
				]),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			const result = await service.getCurrentHoldings(1, 1);

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ asset: "BTC", amount: 1.5, buys: 2, sells: 0 });
		});

		it("should return empty array when no transactions or snapshots", async () => {
			vi.mocked(mockRepository.findLatestByAccount).mockResolvedValue([]);

			const mockQueryBuilder = {
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockReturnThis(),
				getRawMany: vi.fn().mockResolvedValue([]),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			const result = await service.getCurrentHoldings(1, 1);

			expect(result).toEqual([]);
		});

		it("should exclude assets with zero amount when calculating", async () => {
			vi.mocked(mockRepository.findLatestByAccount).mockResolvedValue([]);

			const mockQueryBuilder = {
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockReturnThis(),
				getRawMany: vi.fn().mockResolvedValue([
					{ asset: "BTC", amount: 1.5, buys: 1, sells: 0 },
					{ asset: "ETH", amount: 0, buys: 1, sells: 1 },
				]),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			const result = await service.getCurrentHoldings(1, 1);

			expect(result).toHaveLength(1);
			expect(result[0].asset).toBe("BTC");
		});
	});

	describe("getAllCurrentHoldings", () => {
		it("should return holdings map from latest snapshots", async () => {
			const mockSnapshots = new Map<number, PortfolioSnapshotEntity[]>();
			mockSnapshots.set(1, [
				createMockSnapshot({ providerAccountId: 1, asset: "BTC", amount: 1.5 }),
			]);
			mockSnapshots.set(2, [
				createMockSnapshot({ providerAccountId: 2, asset: "ETH", amount: 2.0 }),
			]);
			vi.mocked(mockRepository.findLatestByUser).mockResolvedValue(mockSnapshots);

			const result = await service.getAllCurrentHoldings(1);

			expect(result.size).toBe(2);
			expect(result.get(1)).toHaveLength(1);
			expect(result.get(1)?.[0].asset).toBe("BTC");
			expect(result.get(2)).toHaveLength(1);
			expect(result.get(2)?.[0].asset).toBe("ETH");
		});

		it("should calculate all holdings when no snapshots exist", async () => {
			vi.mocked(mockRepository.findLatestByUser).mockResolvedValue(new Map());

			const mockQueryBuilder = {
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockReturnThis(),
				getRawMany: vi.fn().mockResolvedValue([
					{ providerAccountId: 1, asset: "BTC", amount: 1.5, buys: 2, sells: 0 },
				]),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			const result = await service.getAllCurrentHoldings(1);

			expect(result.size).toBe(1);
			expect(result.get(1)).toHaveLength(1);
		});

		it("should exclude zero-amount holdings when calculating", async () => {
			vi.mocked(mockRepository.findLatestByUser).mockResolvedValue(new Map());

			const mockQueryBuilder = {
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockReturnThis(),
				getRawMany: vi.fn().mockResolvedValue([
					{ providerAccountId: 1, asset: "BTC", amount: 1.5, buys: 1, sells: 0 },
					{ providerAccountId: 1, asset: "ETH", amount: 0, buys: 1, sells: 1 },
				]),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			const result = await service.getAllCurrentHoldings(1);

			expect(result.size).toBe(1);
			expect(result.get(1)).toHaveLength(1);
			expect(result.get(1)?.[0].asset).toBe("BTC");
		});
	});

	describe("rebuildFromDate", () => {
		it("should delete existing snapshots from the given date", async () => {
			vi.mocked(mockRepository.deleteByAccountAndDateRange).mockResolvedValue(undefined);

			const mockQueryBuilder = {
				where: vi.fn().mockReturnThis(),
				andWhere: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				select: vi.fn().mockReturnThis(),
				getOne: vi.fn().mockResolvedValue(null),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			await service.rebuildFromDate(1, 1, DateTime.utc(2024, 6, 1));

			expect(mockRepository.deleteByAccountAndDateRange).toHaveBeenCalled();
		});

		it("should rebuild snapshots from earliest transaction to now", async () => {
			vi.mocked(mockRepository.deleteByAccountAndDateRange).mockResolvedValue(undefined);
			vi.mocked(mockRepository.saveMany).mockResolvedValue([]);

			const earliestTransaction = {
				timestamp: DateTime.utc(2024, 6, 15, 10, 0, 0),
			};

			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnThis(),
					andWhere: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					select: vi.fn().mockReturnThis(),
					groupBy: vi.fn().mockReturnThis(),
					getOne: vi.fn().mockResolvedValueOnce(earliestTransaction),
					getRawMany: vi.fn().mockResolvedValue([
						{ asset: "BTC", amount: 1.5, eurInvested: 50000, buys: 2, sells: 0 },
					]),
				}),
			} as any);

			await service.rebuildFromDate(1, 1, DateTime.utc(2024, 6, 15));

			expect(mockRepository.deleteByAccountAndDateRange).toHaveBeenCalled();
			expect(mockRepository.saveMany).toHaveBeenCalled();
		});

		it("should do nothing if no transactions exist", async () => {
			vi.mocked(mockRepository.deleteByAccountAndDateRange).mockResolvedValue(undefined);

			const mockQueryBuilder = {
				where: vi.fn().mockReturnThis(),
				andWhere: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				select: vi.fn().mockReturnThis(),
				getOne: vi.fn().mockResolvedValue(null),
			};
			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
			} as any);

			await service.rebuildFromDate(1, 1, DateTime.utc(2024, 6, 1));

			expect(mockRepository.saveMany).not.toHaveBeenCalled();
		});
	});

	describe("rebuildAll", () => {
		it("should delete all snapshots and rebuild from earliest", async () => {
			vi.mocked(mockRepository.deleteByAccount).mockResolvedValue(undefined);

			const earliestTransaction = {
				timestamp: DateTime.utc(2024, 1, 15, 10, 0, 0),
			};

			vi.mocked(mockDataSource.getRepository).mockReturnValue({
				createQueryBuilder: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnThis(),
					andWhere: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					select: vi.fn().mockReturnThis(),
					groupBy: vi.fn().mockReturnThis(),
					getOne: vi.fn().mockResolvedValueOnce(earliestTransaction),
					getRawMany: vi.fn().mockResolvedValue([
						{ asset: "BTC", amount: 1.5, eurInvested: 50000, buys: 2, sells: 0 },
					]),
				}),
			} as any);

			await service.rebuildAll(1, 1);

			expect(mockRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
		});
	});

	describe("getPortfolioHistory", () => {
		it("should return snapshots for account within date range", async () => {
			const mockSnapshots = [
				createMockSnapshot({ date: DateTime.utc(2024, 6, 1), amount: 1.0 }),
				createMockSnapshot({ date: DateTime.utc(2024, 6, 2), amount: 1.5 }),
			];
			vi.mocked(mockRepository.findByAccountAndDateRange).mockResolvedValue(mockSnapshots);

			const startDate = DateTime.utc(2024, 6, 1);
			const endDate = DateTime.utc(2024, 6, 30);

			const result = await service.getPortfolioHistory(1, 1, startDate, endDate);

			expect(mockRepository.findByAccountAndDateRange).toHaveBeenCalledWith(1, 1, startDate, endDate);
			expect(result).toHaveLength(2);
		});

		it("should return all user snapshots when no account specified", async () => {
			const mockSnapshots = [
				createMockSnapshot({ date: DateTime.utc(2024, 6, 1), amount: 1.0 }),
			];
			vi.mocked(mockRepository.findByUserAndDateRange).mockResolvedValue(mockSnapshots);

			const startDate = DateTime.utc(2024, 6, 1);
			const endDate = DateTime.utc(2024, 6, 30);

			const result = await service.getPortfolioHistory(1, undefined, startDate, endDate);

			expect(mockRepository.findByUserAndDateRange).toHaveBeenCalledWith(1, startDate, endDate);
			expect(result).toHaveLength(1);
		});
	});

	describe("snapshotsToAssetStats", () => {
		it("should correctly convert snapshot entity to asset stat", async () => {
			const mockSnapshots = [
				createMockSnapshot({ asset: "BTC", amount: 2.5, buyCount: 3, sellCount: 1 }),
			];
			vi.mocked(mockRepository.findLatestByAccount).mockResolvedValue(mockSnapshots);

			const result = await service.getCurrentHoldings(1, 1);

			expect(result[0]).toMatchObject({
				asset: "BTC",
				amount: 2.5,
				buys: 3,
				sells: 1,
			});
		});
	});
});
