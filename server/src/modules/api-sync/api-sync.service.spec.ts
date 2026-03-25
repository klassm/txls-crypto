import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import { ApiSyncService } from "./api-sync.service.js";
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
  let mockAccountsRepo: any;
  let mockTransactionsRepo: any;
  let mockTransactionsService: any;
  let mockHoldingsService: any;
  let mockPriceBackfillService: any;
  let mockTransferMatchingService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockAccountsRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      findEnabledApiSyncAccounts: vi.fn().mockResolvedValue([]),
      updateSyncSuccess: vi.fn().mockResolvedValue(undefined),
      updateSyncError: vi.fn().mockResolvedValue(undefined),
    };

    mockTransactionsRepo = {
      findByProviderAccountId: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      findManyByExternalIds: vi.fn().mockResolvedValue([]),
      deleteAllByAccount: vi.fn().mockResolvedValue(0),
    };

    mockTransactionsService = {
      importTransactions: vi.fn(),
    };

    mockHoldingsService = {
      rebuildHoldingsFromTimestamp: vi.fn(),
    };

    mockPriceBackfillService = {
      storePricesFromTransactions: vi.fn(),
    };

    mockTransferMatchingService = {
      matchTransfersForUser: vi.fn(),
    };

    service = new ApiSyncService(
      mockAccountsRepo as any,
      mockTransactionsRepo as any,
      mockTransactionsService as any,
      mockHoldingsService as any,
      mockPriceBackfillService as any,
      mockTransferMatchingService as any,
    );
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
      mockAccountsRepo.findById.mockResolvedValue({
        id: 1,
        userId: 1,
        provider: ProviderType.Bitpanda,
        apiEnabled: true,
        apiKeyEncrypted: "test-key",
      });

      const firstSync = service.syncAccount(1, 1);
      const secondSync = service.syncAccount(1, 1);

      const [first, second] = await Promise.all([firstSync, secondSync]);

      expect(second.success).toBe(false);
      expect(second.error).toBe("Already syncing");
    });

    it("should return error when account not found", async () => {
      mockAccountsRepo.findById.mockResolvedValue(null);

      const result = await service.syncAccount(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Account not found");
    });

    it("should return error when API sync not enabled", async () => {
      mockAccountsRepo.findById.mockResolvedValue({
        id: 1,
        userId: 1,
        provider: ProviderType.Bitpanda,
        apiEnabled: false,
        apiKeyEncrypted: null,
      });

      const result = await service.syncAccount(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API sync not enabled for this account");
    });
  });
});
