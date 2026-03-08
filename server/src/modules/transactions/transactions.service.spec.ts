import { describe, it, expect, beforeEach, vi } from "vitest";
import { TransactionsService } from "./transactions.service.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { TransactionEntity } from "./transaction.entity.js";
import { TransactionType } from "@txls/shared";
import type { Transaction } from "@txls/shared";
import { DateTime } from "luxon";

describe("TransactionsService", () => {
  let service: TransactionsService;
  let mockRepository: TransactionsRepository;

  const mockEntity: TransactionEntity = {
    id: 1,
    userId: 1,
    providerAccountId: 1,
    externalId: "TEST-001",
    timestamp: DateTime.fromISO("2026-02-19T10:00:00Z"),
    type: TransactionType.buy,
    asset: "BTC",
    quantity: 0.5,
    eurValue: 1000,
    eurFee: 5,
    processed: false,
    createdAt: DateTime.fromISO("2026-02-19T10:00:00Z"),
    updatedAt: DateTime.fromISO("2026-02-19T10:00:00Z"),
  };

  beforeEach(() => {
    mockRepository = {
      findByProviderAccountId: vi.fn(),
      findByProviderAccountIdAndYear: vi.fn(),
      findOneByExternalId: vi.fn(),
      findOneById: vi.fn(),
      save: vi.fn(),
      saveMany: vi.fn(),
      delete: vi.fn(),
      countByProviderAccountId: vi.fn(),
      countByProviderAccountIdAndYear: vi.fn(),
      findByProviderAccountIdAndType: vi.fn(),
      findByProviderAccountIdAndTypeAndYear: vi.fn(),
      getStatsByProviderAccountIdAndYear: vi.fn(),
      existsByExternalId: vi.fn(),
      findManyByExternalIds: vi.fn(),
    } as any;

    service = new TransactionsService(mockRepository);
  });

  describe("findByProviderAccountId", () => {
    it("should return transactions for account", async () => {
      vi.mocked(mockRepository.findByProviderAccountId).mockResolvedValue([mockEntity]);

      const result = await service.findByProviderAccountId(1, 1);

      expect(mockRepository.findByProviderAccountId).toHaveBeenCalledWith(1, 1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].externalId).toBe("TEST-001");
    });

    it("should return empty array when no transactions", async () => {
      vi.mocked(mockRepository.findByProviderAccountId).mockResolvedValue([]);

      const result = await service.findByProviderAccountId(1, 1);

      expect(result).toEqual([]);
    });

    it("should convert entity to schema", async () => {
      vi.mocked(mockRepository.findByProviderAccountId).mockResolvedValue([mockEntity]);

      const result = await service.findByProviderAccountId(1, 1);

      expect(result[0]).toMatchObject({
        id: 1,
        providerAccountId: 1,
        externalId: "TEST-001",
        timestamp: mockEntity.timestamp,
        type: TransactionType.buy,
        asset: "BTC",
        quantity: 0.5,
        eurValue: 1000,
        eurFee: 5,
        processed: false,
      });
    });

    it("should throw and log error on repository failure", async () => {
      vi.mocked(mockRepository.findByProviderAccountId).mockRejectedValue(
        new Error("DB Error"),
      );

      await expect(service.findByProviderAccountId(1, 1)).rejects.toThrow("DB Error");
    });
  });

  describe("findByProviderAccountIdWithStats", () => {
    it("should return transactions and stats for account and year", async () => {
      vi.mocked(mockRepository.findByProviderAccountIdAndYear).mockResolvedValue([
        mockEntity,
      ]);

      vi.mocked(mockRepository.getStatsByProviderAccountIdAndYear).mockResolvedValue({
        year: 2026,
        staking: { cryptoAmount: 0.05, fiatAmount: 100, count: 2 },
        buys: { cryptoAmount: 0.5, fiatAmount: 2000, count: 2 },
        sells: { cryptoAmount: 0.1, fiatAmount: 500, count: 1 },
        assetStats: [
          {
            asset: "BTC",
            amount: 0.5,
            buys: 1,
            sells: 0,
          },
        ],
      });

      const result = await service.findByProviderAccountIdWithStats(1, 1, 2026);

      expect(mockRepository.findByProviderAccountIdAndYear).toHaveBeenCalledWith(
        1,
        1,
        2026,
      );
      expect(mockRepository.getStatsByProviderAccountIdAndYear).toHaveBeenCalledWith(
        1,
        1,
        2026,
      );
      expect(result.transactions).toHaveLength(1);
      expect(result.stats.year).toBe(2026);
      expect(result.stats.staking.fiatAmount).toBe(100);
    });

    it("should use current year when year not provided", async () => {
      const currentYear = DateTime.now().year;
      vi.mocked(mockRepository.findByProviderAccountIdAndYear).mockResolvedValue([]);
      vi.mocked(mockRepository.getStatsByProviderAccountIdAndYear).mockResolvedValue({
        year: currentYear,
        staking: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
        buys: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
        sells: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
        assetStats: [],
      });

      await service.findByProviderAccountIdWithStats(1, 1);

      expect(mockRepository.findByProviderAccountIdAndYear).toHaveBeenCalledWith(
        1,
        1,
        currentYear,
      );
    });

    it("should return empty asset stats when no transactions", async () => {
      vi.mocked(mockRepository.findByProviderAccountIdAndYear).mockResolvedValue([]);
      vi.mocked(mockRepository.getStatsByProviderAccountIdAndYear).mockResolvedValue({
        year: 2026,
        staking: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
        buys: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
        sells: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
        assetStats: [],
      });

      const result = await service.findByProviderAccountIdWithStats(1, 1, 2026);

      expect(result.stats.assetStats).toEqual([]);
    });
  });

  describe("importTransactions", () => {
    const mockTransaction: Transaction = {
      id: 0,
      providerAccountId: 1,
      externalId: "IMPORT-001",
      timestamp: DateTime.fromISO("2026-02-19T10:00:00Z"),
      type: TransactionType.buy,
      asset: "BTC",
      quantity: 0.5,
      eurValue: 1000,
      eurFee: 5,
      processed: false,
    };

    it("should import new transactions", async () => {
			vi.mocked(mockRepository.findOneByExternalId).mockResolvedValue(null);
			vi.mocked(mockRepository.save).mockResolvedValue(mockEntity);

			const result = await service.importTransactions(1, 1, [mockTransaction]);

			expect(result.imported).toBe(1);
			expect(result.errors).toHaveLength(0);
			expect(mockRepository.findOneByExternalId).toHaveBeenCalledWith(
				"IMPORT-001",
			);
			expect(mockRepository.save).toHaveBeenCalled();
		});

		it("should skip duplicate transactions", async () => {
			vi.mocked(mockRepository.findOneByExternalId).mockResolvedValue(
				mockEntity,
			);

			const result = await service.importTransactions(1, 1, [mockTransaction]);

			expect(result.imported).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("IMPORT-001");
			expect(result.errors[0]).toContain("already exists");
			expect(mockRepository.save).not.toHaveBeenCalled();
		});

		it("should import multiple transactions", async () => {
			const transaction2: Transaction = {
				...mockTransaction,
				id: 0,
				externalId: "IMPORT-002",
			};

			vi.mocked(mockRepository.findOneByExternalId)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(null);
			vi.mocked(mockRepository.save).mockResolvedValue(mockEntity);

			const result = await service.importTransactions(1, 1, [
				mockTransaction,
				transaction2,
			]);

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle partial imports with duplicates", async () => {
      const transaction2: Transaction = {
        ...mockTransaction,
        id: 0,
        externalId: "IMPORT-002",
      };

      vi.mocked(mockRepository.findOneByExternalId)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(mockEntity);
			vi.mocked(mockRepository.save).mockResolvedValue(mockEntity);

			const result = await service.importTransactions(1, 1, [
				mockTransaction,
				transaction2,
			]);

			expect(result.imported).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("IMPORT-002");
		});

		it("should handle save errors gracefully", async () => {
			vi.mocked(mockRepository.findOneByExternalId).mockResolvedValue(null);
			vi.mocked(mockRepository.save).mockRejectedValue(
				new Error("Save failed"),
			);

			const result = await service.importTransactions(1, 1, [mockTransaction]);

			expect(result.imported).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("IMPORT-001");
			expect(result.errors[0]).toContain("Save failed");
		});

		it("should convert transaction DTO to entity", async () => {
			vi.mocked(mockRepository.findOneByExternalId).mockResolvedValue(null);
			vi.mocked(mockRepository.save).mockResolvedValue(mockEntity);

			await service.importTransactions(1, 1, [mockTransaction]);

			expect(mockRepository.save).toHaveBeenCalled();
		});

		it("should return empty result for empty input", async () => {
			const result = await service.importTransactions(1, 1, []);

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
