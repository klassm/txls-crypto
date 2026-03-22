import { describe, it, expect, beforeEach, vi } from "vitest";
import { AssetHoldingsService } from "./asset-holdings.service.js";
import { AssetHoldingsRepository } from "./asset-holdings.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { AccountsRepository } from "../accounts/accounts.repository.js";
import { PricesRepository } from "../prices/prices.repository.js";
import { DateTime } from "luxon";
import { TransactionType } from "@txls/shared";

describe("AssetHoldingsService", () => {
	let service: AssetHoldingsService;
	let mockHoldingsRepository: AssetHoldingsRepository;
	let mockTransactionsRepository: TransactionsRepository;
	let mockAccountsRepository: AccountsRepository;
	let mockPricesRepository: PricesRepository;

	beforeEach(() => {
		mockHoldingsRepository = {
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

		mockTransactionsRepository = {
			findTransactionsByAccountOrdered: vi.fn().mockResolvedValue([]),
			findTransactionsByAccountFromTimestamp: vi.fn().mockResolvedValue([]),
			calculateHoldingsByAccount: vi.fn().mockResolvedValue([]),
			calculateAllHoldingsByUser: vi.fn().mockResolvedValue(new Map()),
			getStakingRewardsByYear: vi.fn().mockResolvedValue({ eurValue: 0, count: 0 }),
			getTotalStakingRewards: vi.fn().mockResolvedValue({ eurValue: 0, count: 0 }),
		} as unknown as TransactionsRepository;

		mockAccountsRepository = {
			findById: vi.fn().mockResolvedValue(null),
		} as unknown as AccountsRepository;

		mockPricesRepository = {
			getLatestPrices: vi.fn().mockResolvedValue(new Map()),
			getPricesInTimeRange: vi.fn().mockResolvedValue([]),
		} as unknown as PricesRepository;

		service = new AssetHoldingsService(
			mockHoldingsRepository,
			mockTransactionsRepository,
			mockAccountsRepository,
			mockPricesRepository
		);
	});

	describe("getCurrentHoldings", () => {
		it("returns holdings from repository when available", async () => {
			const holdings = new Map([
				["BTC", { asset: "BTC", amount: 1.5, eurInvested: 50000 }],
				["ETH", { asset: "ETH", amount: 10, eurInvested: 30000 }],
			]);
			(mockHoldingsRepository.findLatestByAccount as any).mockResolvedValue(holdings);

			const result = await service.getCurrentHoldings(1, 1);

			expect(result).toHaveLength(2);
			expect(result.find((h) => h.asset === "BTC")?.amount).toBe(1.5);
			expect(result.find((h) => h.asset === "ETH")?.amount).toBe(10);
		});

		it("calculates holdings from transactions when repository is empty", async () => {
			(mockHoldingsRepository.findLatestByAccount as any).mockResolvedValue(new Map());
			(mockTransactionsRepository.calculateHoldingsByAccount as any).mockResolvedValue([
				{ asset: "BTC", amount: 1.5, eurInvested: 50000, buys: 0, sells: 0 },
			]);

			const result = await service.getCurrentHoldings(1, 1);

			expect(mockHoldingsRepository.findLatestByAccount).toHaveBeenCalledWith(1, 1);
			expect(mockTransactionsRepository.calculateHoldingsByAccount).toHaveBeenCalledWith(1, 1);
			expect(result).toHaveLength(1);
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
					externalId: "tx1",
					timestamp: DateTime.utc(2024, 1, 1),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "ETH",
					type: TransactionType.buy,
					quantity: 10.0,
					eurValue: 30000,
					externalId: "tx2",
					timestamp: DateTime.utc(2024, 1, 2),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.sell,
					quantity: 0.5,
					eurValue: 25000,
					externalId: "tx3",
					timestamp: DateTime.utc(2024, 1, 3),
				},
			];

			(mockTransactionsRepository.findTransactionsByAccountOrdered as any).mockResolvedValue(transactions);

			await service.rebuildHoldings(1, 1);

			expect(mockHoldingsRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
			expect(mockHoldingsRepository.saveMany).toHaveBeenCalled();

			const savedData = (mockHoldingsRepository.saveMany as any).mock.calls[0][0];
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
					externalId: "tx1",
					timestamp: DateTime.utc(2024, 1, 1),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.withdrawal,
					quantity: 0.5,
					eurValue: 0,
					externalId: "tx2",
					timestamp: DateTime.utc(2024, 1, 2),
				},
			];

			(mockTransactionsRepository.findTransactionsByAccountOrdered as any).mockResolvedValue(transactions);

			await service.rebuildHoldings(1, 1);

			const savedData = (mockHoldingsRepository.saveMany as any).mock.calls[0][0];
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
					externalId: "tx1",
					timestamp: DateTime.utc(2024, 1, 1),
				},
			];

			(mockTransactionsRepository.findTransactionsByAccountOrdered as any).mockResolvedValue(transactions);

			await service.rebuildHoldings(1, 1);

			const savedData = (mockHoldingsRepository.saveMany as any).mock.calls[0][0];
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
					externalId: "tx1",
					timestamp: DateTime.utc(2024, 1, 1),
				},
				{
					userId: 1,
					providerAccountId: 1,
					asset: "BTC",
					type: TransactionType.sell,
					quantity: 1.0,
					eurValue: 50000,
					externalId: "tx2",
					timestamp: DateTime.utc(2024, 1, 2),
				},
			];

			(mockTransactionsRepository.findTransactionsByAccountOrdered as any).mockResolvedValue(transactions);

			await service.rebuildHoldings(1, 1);

			const savedData = (mockHoldingsRepository.saveMany as any).mock.calls[0][0];
			expect(savedData).toHaveLength(1);
			expect(savedData[0].amount).toBe(1.0);
		});

		it("handles empty transactions gracefully", async () => {
			(mockTransactionsRepository.findTransactionsByAccountOrdered as any).mockResolvedValue([]);

			await service.rebuildHoldings(1, 1);

			expect(mockHoldingsRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
			expect(mockHoldingsRepository.saveMany).not.toHaveBeenCalled();
		});
	});

	describe("rebuildHoldingsFromTimestamp", () => {
		it("rebuilds all holdings when no existing holdings found", async () => {
			(mockHoldingsRepository.findLatestByAccount as any).mockResolvedValue(new Map());

			await service.rebuildHoldingsFromTimestamp(1, 1, DateTime.utc(2024, 2, 1));

			expect(mockHoldingsRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
		});

		it("rebuilds holdings from timestamp preserving earlier state", async () => {
			const existingHoldings = new Map([
				["BTC", { asset: "BTC", amount: 1.0, eurInvested: 50000 }],
			]);

			(mockHoldingsRepository.findLatestByAccount as any).mockResolvedValue(existingHoldings);
			(mockHoldingsRepository.getHoldingsUpToTimestamp as any).mockResolvedValue(existingHoldings);

			const transactions = [
				{
					userId: 1,
					providerAccountId: 1,
					asset: "ETH",
					type: TransactionType.buy,
					quantity: 5.0,
					eurValue: 15000,
					externalId: "tx1",
					timestamp: DateTime.utc(2024, 2, 1),
				},
			];

			(mockTransactionsRepository.findTransactionsByAccountFromTimestamp as any).mockResolvedValue(transactions);

			await service.rebuildHoldingsFromTimestamp(1, 1, DateTime.utc(2024, 2, 1));

			expect(mockHoldingsRepository.deleteByAccountFromTimestamp).toHaveBeenCalled();
			expect(mockHoldingsRepository.getHoldingsUpToTimestamp).toHaveBeenCalled();
		});
	});

	describe("getPortfolioHistoryWithPrices", () => {
		it("returns empty array when no holdings exist", async () => {
			(mockHoldingsRepository.findLatestByUser as any).mockResolvedValue(new Map());

			const result = await service.getPortfolioHistoryWithPrices(1);

			expect(result).toEqual([]);
		});
	});

	describe("getPortfolioOverview", () => {
		it("returns empty overview when no holdings exist", async () => {
			(mockHoldingsRepository.findLatestByUser as any).mockResolvedValue(new Map());

			const result = await service.getPortfolioOverview(1);

			expect(result.portfolioHistory).toEqual([]);
			expect(result.assets).toEqual([]);
			expect(result.accounts).toEqual([]);
		});
	});

	describe("deleteByAccount", () => {
		it("deletes holdings for account", async () => {
			await service.deleteByAccount(1, 1);

			expect(mockHoldingsRepository.deleteByAccount).toHaveBeenCalledWith(1, 1);
		});
	});
});
