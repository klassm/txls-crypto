import { describe, it, expect, beforeEach, vi } from "vitest";
import { AssetHoldingsService } from "./asset-holdings.service.js";
import { AssetHoldingsRepository } from "./asset-holdings.repository.js";
import { PricesRepository } from "../prices/prices.repository.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { AccountEntity } from "../accounts/account.entity.js";
import { AssetPriceEntity } from "../prices/asset-price.entity.js";
import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { TransactionType } from "@txls/shared";

describe("AssetHoldingsService", () => {
	let service: AssetHoldingsService;
	let mockRepository: AssetHoldingsRepository;
	let mockPricesRepository: PricesRepository;
	let mockDataSource: DataSource;

	const createMockDataSource = (transactions: any[] = [], accounts: any[] = []): DataSource => {
		const queryBuilder = {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			groupBy: vi.fn().mockReturnThis(),
			getMany: vi.fn().mockResolvedValue(transactions),
			getRawMany: vi.fn().mockResolvedValue([]),
		};

		const transactionRepo = {
			createQueryBuilder: vi.fn(() => queryBuilder),
			find: vi.fn().mockResolvedValue(transactions),
		};

		const accountRepo = {
			findOne: vi.fn().mockImplementation(({ where }) => {
				const account = accounts.find((a) => a.id === where.id);
				return Promise.resolve(account || null);
			}),
		};

		return {
			getRepository: vi.fn((entity) => {
				if (entity === TransactionEntity) return transactionRepo;
				if (entity === AccountEntity) return accountRepo;
				return {};
			}),
			query: vi.fn().mockResolvedValue([]),
		} as unknown as DataSource;
	};

	beforeEach(() => {
		mockRepository = {
			findLatestByAccount: vi.fn().mockResolvedValue(new Map()),
			findLatestByUser: vi.fn().mockResolvedValue(new Map()),
			getHoldingsUpToTimestamp: vi.fn().mockResolvedValue(new Map()),
			getAllHoldingsUpToTimestamp: vi.fn().mockResolvedValue(new Map()),
			save: vi.fn().mockResolvedValue({}),
			saveMany: vi.fn().mockResolvedValue(undefined),
			deleteByAccount: vi.fn().mockResolvedValue(undefined),
			deleteByAccountFromTimestamp: vi.fn().mockResolvedValue(undefined),
			findDistinctTimestamps: vi.fn().mockResolvedValue([]),
		} as unknown as AssetHoldingsRepository;

		mockPricesRepository = {
			getLatestPrices: vi.fn().mockResolvedValue(new Map()),
			getPricesInTimeRange: vi.fn().mockResolvedValue([]),
		} as unknown as PricesRepository;
	});

	describe("getCurrentHoldings", () => {
		it("returns holdings from repository when available", async () => {
			const holdings = new Map([
				["BTC", { asset: "BTC", amount: 1.5, eurInvested: 50000 }],
				["ETH", { asset: "ETH", amount: 10, eurInvested: 30000 }],
			]);
			mockRepository.findLatestByAccount = vi.fn().mockResolvedValue(holdings);
			mockDataSource = createMockDataSource();

			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);
			const result = await service.getCurrentHoldings(1, 1);

			expect(result).toHaveLength(2);
			expect(result.find((h) => h.asset === "BTC")?.amount).toBe(1.5);
			expect(result.find((h) => h.asset === "ETH")?.amount).toBe(10);
		});

		it("calculates holdings from transactions when repository is empty", async () => {
			mockRepository.findLatestByAccount = vi.fn().mockResolvedValue(new Map());

			const transactions = [
				{ asset: "BTC", type: TransactionType.buy, quantity: 1.5, eurValue: 50000 },
				{ asset: "ETH", type: TransactionType.buy, quantity: 10, eurValue: 30000 },
				{ asset: "BTC", type: TransactionType.sell, quantity: 0.5, eurValue: 20000 },
			];
			mockDataSource = createMockDataSource(transactions);

			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);
			const result = await service.getCurrentHoldings(1, 1);

			expect(mockRepository.findLatestByAccount).toHaveBeenCalledWith(1, 1);
		});
	});

	describe("rebuildHoldings", () => {
		it("rebuilds holdings from all transactions", async () => {
			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 1.0,
					eurValue: 50000,
					timestamp: DateTime.utc(2024, 1, 1),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "ETH",
					type: TransactionType.buy,
					quantity: 10.0,
					eurValue: 30000,
					timestamp: DateTime.utc(2024, 1, 2),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.sell,
					quantity: 0.5,
					eurValue: 25000,
					timestamp: DateTime.utc(2024, 1, 3),
				},
			];

			mockDataSource = createMockDataSource(transactions);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldings(1, 1);

			expect(mockRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
			expect(mockRepository.saveMany).toHaveBeenCalled();

			const savedData = (mockRepository.saveMany as any).mock.calls[0][0];
			expect(savedData).toHaveLength(3);

			const btcHoldings = savedData.filter((d: any) => d.asset === "BTC");
			expect(btcHoldings[0].amount).toBe(1.0);
			expect(btcHoldings[1].amount).toBe(0.5);

			const ethHolding = savedData.find((d: any) => d.asset === "ETH");
			expect(ethHolding.amount).toBe(10.0);
		});

		it("handles withdrawal transactions correctly", async () => {
			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 1.0,
					eurValue: 50000,
					timestamp: DateTime.utc(2024, 1, 1),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.withdrawal,
					quantity: 0.5,
					eurValue: 0,
					timestamp: DateTime.utc(2024, 1, 2),
				},
			];

			mockDataSource = createMockDataSource(transactions);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldings(1, 1);

			const savedData = (mockRepository.saveMany as any).mock.calls[0][0];
			const lastBtcHolding = savedData.filter((d: any) => d.asset === "BTC").pop();
			expect(lastBtcHolding.amount).toBe(0.5);
		});

		it("handles deposit transactions correctly", async () => {
			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.deposit,
					quantity: 1.0,
					eurValue: 50000,
					timestamp: DateTime.utc(2024, 1, 1),
				},
			];

			mockDataSource = createMockDataSource(transactions);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldings(1, 1);

			const savedData = (mockRepository.saveMany as any).mock.calls[0][0];
			expect(savedData[0].eurInvested).toBe(50000);
		});

		it("does not save holdings when amount is zero or negative", async () => {
			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 1.0,
					eurValue: 50000,
					timestamp: DateTime.utc(2024, 1, 1),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.sell,
					quantity: 1.0,
					eurValue: 50000,
					timestamp: DateTime.utc(2024, 1, 2),
				},
			];

			mockDataSource = createMockDataSource(transactions);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldings(1, 1);

			const savedData = (mockRepository.saveMany as any).mock.calls[0][0];
			expect(savedData).toHaveLength(1);
			expect(savedData[0].amount).toBe(1.0);
		});

		it("handles empty transactions gracefully", async () => {
			mockDataSource = createMockDataSource([]);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldings(1, 1);

			expect(mockRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
			expect(mockRepository.saveMany).not.toHaveBeenCalled();
		});
	});

	describe("rebuildHoldingsFromTimestamp", () => {
		it("rebuilds all holdings when no existing holdings found", async () => {
			mockRepository.findLatestByAccount = vi.fn().mockResolvedValue(new Map());

			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.buy,
					quantity: 1.0,
					eurValue: 50000,
					timestamp: DateTime.utc(2024, 1, 1),
				},
			];

			mockDataSource = createMockDataSource(transactions);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldingsFromTimestamp(1, 1, DateTime.utc(2024, 2, 1));

			expect(mockRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
		});

		it("rebuilds holdings from timestamp preserving earlier state", async () => {
			const existingHoldings = new Map([
				["BTC", { asset: "BTC", amount: 1.0, eurInvested: 50000 }],
			]);

			mockRepository.findLatestByAccount = vi.fn().mockResolvedValue(existingHoldings);
			mockRepository.getHoldingsUpToTimestamp = vi.fn().mockResolvedValue(existingHoldings);

			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "ETH",
					type: TransactionType.buy,
					quantity: 5.0,
					eurValue: 15000,
					timestamp: DateTime.utc(2024, 2, 1),
				},
			];

			mockDataSource = createMockDataSource(transactions);
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.rebuildHoldingsFromTimestamp(1, 1, DateTime.utc(2024, 2, 1));

			expect(mockRepository.deleteByAccountFromTimestamp).toHaveBeenCalled();
			expect(mockRepository.getHoldingsUpToTimestamp).toHaveBeenCalled();
		});
	});

	describe("getPortfolioHistoryWithPrices", () => {
		it("returns empty array when no holdings exist", async () => {
			mockRepository.findLatestByUser = vi.fn().mockResolvedValue(new Map());
			mockDataSource = createMockDataSource();

			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);
			const result = await service.getPortfolioHistoryWithPrices(1);

			expect(result).toEqual([]);
		});
	});

	describe("getPortfolioOverview", () => {
		it("returns empty overview when no holdings exist", async () => {
			mockRepository.findLatestByUser = vi.fn().mockResolvedValue(new Map());
			mockDataSource = createMockDataSource();

			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);
			const result = await service.getPortfolioOverview(1);

			expect(result.portfolioHistory).toEqual([]);
			expect(result.assets).toEqual([]);
			expect(result.accounts).toEqual([]);
		});
	});

	describe("deleteByAccount", () => {
		it("deletes holdings for account", async () => {
			mockDataSource = createMockDataSource();
			service = new AssetHoldingsService(mockDataSource, mockRepository, mockPricesRepository);

			await service.deleteByAccount(1, 1);

			expect(mockRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
		});
	});
});
