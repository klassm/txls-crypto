import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import type { Transaction } from "@txls/shared";
import { AccountEntity } from "../accounts/account.entity.js";
import { AccountsRepository } from "../accounts/accounts.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { TransactionsService } from "../transactions/transactions.service.js";
import { PortfolioSnapshotsService } from "../portfolio-snapshots/portfolio-snapshots.service.js";
import { PriceBackfillService } from "../prices/price-backfill.service.js";
import { TransactionEntity } from "../transactions/transaction.entity.js";
import { getProviderConfig } from "../../providers/registry.js";
import type { ApiSyncClient } from "../../providers/types.js";
import { decrypt } from "./encryption.service.js";
import { logger } from "../../common/logger.js";
import { broadcastSyncEvent } from "../../websocket.js";

export interface SyncResult {
  accountId: number;
  success: boolean;
  imported: number;
  error?: string;
}

export class ApiSyncService {
  private accountsRepo: AccountsRepository;
  private transactionsRepo: TransactionsRepository;
  private transactionsService: TransactionsService;
  private portfolioService: PortfolioSnapshotsService;
  private priceBackfillService: PriceBackfillService;
  private syncingAccounts = new Set<number>();

  constructor(private dataSource: DataSource) {
    this.accountsRepo = new AccountsRepository(dataSource);
    this.transactionsRepo = new TransactionsRepository(dataSource);
    this.transactionsService = new TransactionsService(this.transactionsRepo);
    this.portfolioService = new PortfolioSnapshotsService(dataSource);
    this.priceBackfillService = new PriceBackfillService(dataSource);
  }

  async syncAllAccounts(): Promise<SyncResult[]> {
    const accounts = await this.getEnabledAccounts();
    const results: SyncResult[] = [];

    for (const account of accounts) {
      const result = await this.syncAccount(account.id, account.userId);
      results.push(result);
    }

    return results;
  }

  async syncAccount(accountId: number, userId: number, fullSync = false): Promise<SyncResult> {
    if (this.syncingAccounts.has(accountId)) {
      logger.warn({ accountId }, "[ApiSyncService] Account already syncing, skipping");
      return { accountId, success: false, imported: 0, error: "Already syncing" };
    }

    this.syncingAccounts.add(accountId);
    broadcastSyncEvent(userId, accountId, "sync-started", {});

    try {
      const account = await this.accountsRepo.findById(userId, accountId);
      if (!account) {
        throw new Error("Account not found");
      }

      if (!account.apiEnabled || !account.apiKeyEncrypted) {
        throw new Error("API sync not enabled for this account");
      }

      const providerConfig = getProviderConfig(account.provider);
      if (!providerConfig.apiClient) {
        throw new Error(`Provider ${account.provider} does not support API sync`);
      }

      const apiKey = decrypt(account.apiKeyEncrypted);

      logger.info({ accountId, provider: account.provider, fullSync }, "[ApiSyncService] Starting sync");

      if (fullSync) {
        return await this.performFullSync(account, apiKey, providerConfig.apiClient);
      } else {
        return await this.performIncrementalSync(account, apiKey, providerConfig.apiClient);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ accountId, error: errorMessage }, "[ApiSyncService] Sync failed");

      await this.updateSyncError(accountId, errorMessage);
      broadcastSyncEvent(userId, accountId, "sync-error", { error: errorMessage });

      return { accountId, success: false, imported: 0, error: errorMessage };
    } finally {
      this.syncingAccounts.delete(accountId);
    }
  }

  private async performIncrementalSync(
    account: AccountEntity,
    apiKey: string,
    apiClient: ApiSyncClient
  ): Promise<SyncResult> {
    const { accountId, userId } = { accountId: account.id, userId: account.userId };

    const knownExternalIds = await this.transactionsRepo.getExternalIdsByAccountId(accountId);
    const result = await apiClient.fetchTransactions(apiKey, knownExternalIds);

    if (result.transactions.length === 0) {
      logger.info({ accountId }, "[ApiSyncService] No new transactions to import");
      await this.updateSyncSuccess(account);
      broadcastSyncEvent(userId, accountId, "sync-complete", { imported: 0 });
      return { accountId, success: true, imported: 0 };
    }

    const earliestTimestamp = this.getEarliestTimestamp(result.transactions);

    const importResult = await this.transactionsService.importTransactions(
      userId,
      accountId,
      result.transactions
    );

    const savedTransactions = await this.getSavedTransactions(accountId, result.transactions);

    if (savedTransactions.length > 0) {
      await this.priceBackfillService.storePricesFromTransactions(savedTransactions);
      await this.priceBackfillService.fillTransferPrices(accountId);
      await this.portfolioService.rebuildFromDate(
        userId,
        accountId,
        earliestTimestamp.startOf("day")
      );
    }

    await this.updateSyncSuccess(account);

    logger.info(
      { accountId, imported: importResult.imported, errors: importResult.errors.length, wasIncremental: result.wasIncremental },
      "[ApiSyncService] Incremental sync completed"
    );

    broadcastSyncEvent(userId, accountId, "sync-complete", { imported: importResult.imported });

    return { accountId, success: true, imported: importResult.imported };
  }

  private async performFullSync(
    account: AccountEntity,
    apiKey: string,
    apiClient: ApiSyncClient
  ): Promise<SyncResult> {
    const { accountId, userId } = { accountId: account.id, userId: account.userId };

    const result = await apiClient.fetchTransactions(apiKey);

    if (result.transactions.length === 0) {
      logger.info({ accountId }, "[ApiSyncService] No transactions to import");
      await this.updateSyncSuccess(account);
      broadcastSyncEvent(userId, accountId, "sync-complete", { imported: 0 });
      return { accountId, success: true, imported: 0 };
    }

    const earliestTimestamp = this.getEarliestTimestamp(result.transactions);
    await this.deleteAllTransactions(accountId);

    const importResult = await this.transactionsService.importTransactions(
      userId,
      accountId,
      result.transactions
    );

    const savedTransactions = await this.getSavedTransactions(accountId, result.transactions);

    if (savedTransactions.length > 0) {
      await this.priceBackfillService.storePricesFromTransactions(savedTransactions);
      await this.priceBackfillService.fillTransferPrices(accountId);
      await this.portfolioService.rebuildFromDate(
        userId,
        accountId,
        earliestTimestamp.startOf("day")
      );
    }

    await this.updateSyncSuccess(account);

    logger.info(
      { accountId, imported: importResult.imported, errors: importResult.errors.length },
      "[ApiSyncService] Full sync completed"
    );

    broadcastSyncEvent(userId, accountId, "sync-complete", { imported: importResult.imported });

    return { accountId, success: true, imported: importResult.imported };
  }

  async validateApiKey(
    provider: string,
    apiKey: string
  ): Promise<{ valid: boolean; error?: string }> {
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig.apiClient) {
      return { valid: false, error: "Provider does not support API sync" };
    }

    try {
      const valid = await providerConfig.apiClient.testConnection(apiKey);
      if (valid) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid API key" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMessage };
    }
  }

  isSyncing(accountId: number): boolean {
    return this.syncingAccounts.has(accountId);
  }

  private async getEnabledAccounts(): Promise<AccountEntity[]> {
    const repo = this.dataSource.getRepository(AccountEntity);
    return repo
      .createQueryBuilder("account")
      .where("account.apiEnabled = :enabled", { enabled: true })
      .andWhere("account.apiKeyEncrypted IS NOT NULL")
      .getMany();
  }

  private getEarliestTimestamp(transactions: Transaction[]): DateTime {
    const timestamps = transactions.map((t) => t.timestamp.toMillis());
    const earliest = Math.min(...timestamps);
    return DateTime.fromMillis(earliest);
  }

  private async deleteAllTransactions(accountId: number): Promise<void> {
    const repo = this.dataSource.getRepository(TransactionEntity);

    await repo
      .createQueryBuilder()
      .delete()
      .where("provider_account_id = :accountId", { accountId })
      .execute();

    logger.info({ accountId }, "[ApiSyncService] Deleted all existing transactions");
  }

  private async getSavedTransactions(
    accountId: number,
    transactions: Transaction[]
  ): Promise<TransactionEntity[]> {
    const externalIds = transactions.map((t) => t.externalId);
    return this.transactionsRepo.findManyByExternalIds(externalIds);
  }

  private async updateSyncSuccess(account: AccountEntity): Promise<void> {
    const repo = this.dataSource.getRepository(AccountEntity);
    account.lastSyncAt = DateTime.now();
    account.syncError = null;
    await repo.save(account);
  }

  private async updateSyncError(accountId: number, error: string): Promise<void> {
    const repo = this.dataSource.getRepository(AccountEntity);
    await repo.update(accountId, {
      syncError: error,
      updatedAt: DateTime.now(),
    });
  }
}
