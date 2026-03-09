import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import { ApiSyncService } from "./api-sync.service.js";
import type { DataSource } from "typeorm";
import type { AccountEntity } from "../accounts/account.entity.js";
import { ProviderType } from "@txls/shared";
import { TransactionType } from "@txls/shared";

vi.mock("../../websocket.js", () => ({
  broadcastSyncEvent: vi.fn(),
}));

vi.mock("../../providers/registry.js", () => ({
  getProviderConfig: vi.fn(() => ({
    apiClient: {
      fetchTransactions: vi.fn(),
      testConnection: vi.fn(),
    },
  })),
}));

vi.mock("./encryption.service.js", () => ({
  decrypt: vi.fn((key) => key),
}));

describe("ApiSyncService", () => {
  let service: ApiSyncService;
  let mockDataSource: DataSource;
  let mockAccountRepo: any;
  let mockTransactionsRepo: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getOne: vi.fn(),
      getMany: vi.fn().mockResolvedValue([]),
    };

    mockAccountRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      createQueryBuilder: vi.fn(() => mockQueryBuilder),
    };

    mockTransactionsRepo = {
      findManyByExternalIds: vi.fn(),
      save: vi.fn(),
    };

    mockDataSource = {
      getRepository: vi.fn((entity: any) => {
        if (entity.name === "AccountEntity") return mockAccountRepo;
        if (entity.name === "TransactionEntity") return mockTransactionsRepo;
        return {};
      }),
    } as any;

    service = new ApiSyncService(mockDataSource);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validateApiKey", () => {
    it("should return valid for working API key", async () => {
      const { getProviderConfig } = await import("../../providers/registry.js");
      vi.mocked(getProviderConfig).mockReturnValue({
        apiClient: {
          testConnection: vi.fn().mockResolvedValue(true),
        },
      } as any);

      const result = await service.validateApiKey("bitpanda", "test-key");

      expect(result.valid).toBe(true);
    });

    it("should return invalid for non-working API key", async () => {
      const { getProviderConfig } = await import("../../providers/registry.js");
      vi.mocked(getProviderConfig).mockReturnValue({
        apiClient: {
          testConnection: vi.fn().mockResolvedValue(false),
        },
      } as any);

      const result = await service.validateApiKey("bitpanda", "invalid-key");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("should return error when provider does not support API sync", async () => {
      const { getProviderConfig } = await import("../../providers/registry.js");
      vi.mocked(getProviderConfig).mockReturnValue({
        apiClient: undefined,
      } as any);

      const result = await service.validateApiKey("traderepublic", "test-key");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Provider does not support API sync");
    });
  });

  describe("isSyncing", () => {
    it("should return false when not syncing", () => {
      expect(service.isSyncing(1)).toBe(false);
    });
  });

  describe("syncAccount", () => {
    it("should skip when already syncing", async () => {
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue({
          id: 1,
          userId: 1,
          provider: ProviderType.Bitpanda,
          apiEnabled: true,
          apiKeyEncrypted: "test-key",
        }),
      };
      mockAccountRepo.createQueryBuilder = vi.fn(() => mockQueryBuilder);

      const firstSync = service.syncAccount(1, 1);
      const secondSync = service.syncAccount(1, 1);

      const [first, second] = await Promise.all([firstSync, secondSync]);

      expect(second.success).toBe(false);
      expect(second.error).toBe("Already syncing");
    });

    it("should return error when account not found", async () => {
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(null),
      };
      mockAccountRepo.createQueryBuilder = vi.fn(() => mockQueryBuilder);

      const result = await service.syncAccount(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Account not found");
    });

    it("should return error when API sync not enabled", async () => {
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue({
          id: 1,
          userId: 1,
          provider: ProviderType.Bitpanda,
          apiEnabled: false,
          apiKeyEncrypted: null,
        }),
      };
      mockAccountRepo.createQueryBuilder = vi.fn(() => mockQueryBuilder);

      const result = await service.syncAccount(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API sync not enabled for this account");
    });
  });
});
