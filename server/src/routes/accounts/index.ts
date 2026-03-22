import { Router } from "express";
import multer from "multer";
import { Request, Response } from "express";
import {
  getAccountsService,
  getTransactionsService,
  getAssetHoldingsService,
  getTransactionsRepository,
  getAccountsRepository,
  getTaxCalculationService,
  getWisoCsvExportService,
  getApiSyncService,
  getPriceBackfillService,
  getTransferMatchingService,
  getImportDeduplicationService,
} from "../../di/service-locator.js";
import { getProviderConfig } from "../../providers/registry.js";
import { TransactionType } from "@txls/shared";
import { toISOString } from "../../utils/date.js";
import { DateTime } from "luxon";
import { getUserIdFromRequest, verifyToken, AUTH_COOKIE_NAME } from "../../utils/session.js";
import { logger } from "../../common/logger.js";
import { encrypt } from "../../modules/api-sync/encryption.service.js";
import { z } from "zod";
import { createAccountSchema } from "../../validation/schemas.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const manualStakingSchema = z.object({
  timestamp: z.string().min(1, "Date and time is required"),
  asset: z.string().min(1, "Asset is required"),
  quantity: z.number().positive("Quantity must be positive"),
  eurValue: z.number().positive("EUR value must be positive"),
});

router.get("/", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const accountsService = getAccountsService();
  const serializedAccounts = (await accountsService.findAll(userId)).map((acc) => ({
    ...acc,
    createdAt: toISOString(acc.createdAt) ?? "",
    updatedAt: toISOString(acc.updatedAt) ?? "",
  }));
  return res.json(serializedAccounts);
});

router.post("/", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const validationResult = createAccountSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ error: validationResult.error.issues[0].message });
  }

  const accountsService = getAccountsService();
  const account = await accountsService.create(userId, validationResult.data);
  const serializedAccount = account ? {
    ...account,
    createdAt: toISOString(account.createdAt) ?? "",
    updatedAt: toISOString(account.updatedAt) ?? "",
  } : null;
  return res.status(201).json(serializedAccount);
});

router.get("/portfolio-history", async (req: Request, res: Response) => {
	const userId = await getUserIdFromRequest(req);
	if (!userId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		const daysParam = req.query.days as string | undefined;
		const days = daysParam ? Number.parseInt(daysParam, 10) : 30;

		if (isNaN(days) || days < 1 || days > 3650) {
			return res.status(400).json({ error: "Days must be between 1 and 3650" });
		}

		const snapshotsService = getAssetHoldingsService();
		const result = await snapshotsService.getPortfolioHistoryWithPrices(userId, undefined, { days });

		return res.json(result);
	} catch (error) {
		console.error("Portfolio history failed:", error);
		return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
	}
});

router.get("/:id", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const accountId = Number.parseInt(req.params.id as string, 10);

  if (isNaN(accountId)) {
    return res.status(400).json({ error: "Invalid account ID" });
  }

  const accountsService = getAccountsService();
  const account = await accountsService.findById(userId, accountId);

  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  const serializedAccount = {
    ...account,
    createdAt: toISOString(account.createdAt) ?? "",
    updatedAt: toISOString(account.updatedAt) ?? "",
  };

  return res.json(serializedAccount);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const accountId = Number.parseInt(req.params.id as string, 10);

  if (isNaN(accountId)) {
    return res.status(400).json({ error: "Invalid account ID" });
  }

  const accountsService = getAccountsService();
  await accountsService.delete(userId, accountId);

  return res.json({ success: true });
});

router.get("/:id/transactions", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const yearParam = req.query.year as string | undefined;
    const currentYear = DateTime.now().year;

    if (yearParam !== undefined) {
      const parsedYear = Number.parseInt(yearParam, 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
        return res.status(400).json({ error: `Invalid year. Must be between 2000 and ${currentYear}` });
      }
    }

    const year = yearParam ? Number.parseInt(yearParam, 10) : currentYear;

    const accountsService = getAccountsService();
    const transactionsService = getTransactionsService();
    const transactionsRepository = getTransactionsRepository();

    const account = await accountsService.findById(userId, accountId);

    const result = await transactionsService.findByProviderAccountIdWithStats(userId, accountId, year);

    const availableYears = await transactionsRepository.getAvailableYears(userId, accountId);

    const uniqueYears = new Set([currentYear, ...availableYears]);
    const sortedYears = Array.from(uniqueYears).sort((a, b) => b - a);

    const serializedTransactions = result.transactions.map((tx: any) => ({
      ...tx,
      timestamp: toISOString(tx.timestamp) ?? "",
    }));

    const serializedAccount = account ? {
      ...account,
      createdAt: toISOString(account.createdAt) ?? "",
      updatedAt: toISOString(account.updatedAt) ?? "",
    } : {
      id: accountId,
      source: "" as any,
      csvImportAllowed: true,
      createdAt: toISOString(DateTime.now()) ?? "",
      updatedAt: toISOString(DateTime.now()) ?? "",
    };

    return res.json({
      account: serializedAccount,
      transactions: serializedTransactions,
      stats: result.stats,
      availableYears: sortedYears,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/:id/transactions/import", upload.single("file"), async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ message: "File too large. Maximum size is 10MB" });
    }

    const csvContent = file.buffer.toString("utf-8");

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({ message: "File is empty" });
    }

    const accountsRepository = getAccountsRepository();
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (account.apiEnabled) {
      return res.status(400).json({ message: "CSV import is disabled when API sync is enabled" });
    }

    const csvImporter = getProviderConfig(account.provider).csvImporter;
    if (!csvImporter) {
      return res.status(500).json({ message: "No CSV importer configured for this account" });
    }

    let parseResult;
    try {
      parseResult = csvImporter.parseCsv(csvContent, accountId);
    } catch (error) {
      if (error instanceof Error && error.name === "ImportError") {
        return res.status(400).json({ message: error.message, details: (error as any).details });
      }
      throw error;
    }

    const { transactions, validationErrors } = parseResult;

    const deduplicationService = getImportDeduplicationService();
    deduplicationService.setUserId(userId);
    const dedupResult = await deduplicationService.shouldSkipOrReplace(accountId, transactions);

    if (dedupResult.shouldSkip) {
      return res.json({
        imported: 0,
        skipped: dedupResult.count,
        message: "Import skipped - data matches existing records",
      });
    }

    if (transactions.length === 0) {
      return res.json({
        imported: 0,
        validationErrors,
        message: "No valid transactions imported",
      });
    }

    const transactionsService = getTransactionsService();
    const transactionsRepository = getTransactionsRepository();

    const importResult = await transactionsService.importTransactions(userId, accountId, transactions);

    if (importResult.imported > 0) {
      const priceBackfillService = getPriceBackfillService();
      const savedEntities = await transactionsRepository.findByProviderAccountId(userId, accountId);
      const newlySaved = savedEntities.filter(e => 
        transactions.some(t => t.externalId === e.externalId)
      );
      await priceBackfillService.storePricesFromTransactions(newlySaved);

      const transferMatchingService = getTransferMatchingService();
      await transferMatchingService.matchTransfersForUser(userId);
    }

    if (importResult.imported > 0 && transactions.length > 0) {
      const earliestTx = transactions.reduce((earliest, tx) => {
        const txTime = tx.timestamp instanceof DateTime ? tx.timestamp : DateTime.fromISO(tx.timestamp as unknown as string);
        const earliestTime = earliest.timestamp instanceof DateTime ? earliest.timestamp : DateTime.fromISO(earliest.timestamp as unknown as string);
        return txTime < earliestTime ? tx : earliest;
      });

      const earliestTime = earliestTx.timestamp instanceof DateTime 
        ? earliestTx.timestamp 
        : DateTime.fromISO(earliestTx.timestamp as unknown as string);

      const holdingsService = getAssetHoldingsService();
      await holdingsService.rebuildHoldingsFromTimestamp(
        userId,
        accountId,
        earliestTime,
      );
    }

    return res.json({
      imported: importResult.imported,
      errors: importResult.errors,
      validationErrors,
    });
  } catch (error) {
    console.error("CSV import failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/:id/transactions", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const validationResult = manualStakingSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.issues[0].message });
    }

    const { timestamp, asset, quantity, eurValue } = validationResult.data;

    const accountsRepository = getAccountsRepository();
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const providerConfig = getProviderConfig(account.provider);
    if (!providerConfig.supportsManualStaking) {
      return res.status(400).json({ error: "This provider does not support manual staking entries" });
    }

    const parsedTimestamp = DateTime.fromISO(timestamp);
    if (!parsedTimestamp.isValid) {
      return res.status(400).json({ error: "Invalid timestamp format" });
    }

    const transaction = {
      id: 0,
      providerAccountId: accountId,
      externalId: `manual-staking-${timestamp}-${asset}`,
      timestamp: parsedTimestamp,
      type: TransactionType.reward,
      asset,
      quantity,
      eurValue,
      eurFee: 0,
      eurRate: eurValue / quantity,
      processed: false,
    };

    const transactionsService = getTransactionsService();
    const result = await transactionsService.importTransactions(userId, accountId, [transaction]);

    if (result.imported > 0) {
      const holdingsService = getAssetHoldingsService();
      await holdingsService.rebuildHoldingsFromTimestamp(userId, accountId, parsedTimestamp);
    }

    return res.json({ success: true, imported: result.imported });
  } catch (error) {
    console.error("Manual staking failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/:id/tax", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const year = req.query.year as string;

    if (!year) {
      return res.status(400).json({ error: "Year parameter is required" });
    }

    const currentYear = DateTime.now().year;
    const parsedYear = Number.parseInt(year, 10);
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
      return res.status(400).json({ error: `Invalid year. Must be between 2000 and ${currentYear}` });
    }

    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId) || accountId <= 0) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const transactionsRepository = getTransactionsRepository();
    const transactionEntities = await transactionsRepository.findByProviderAccountId(userId, accountId);

    const transactions = transactionEntities.map((e) => ({
      id: e.id,
      providerAccountId: e.providerAccountId,
      externalId: e.externalId,
      timestamp: e.timestamp,
      type: e.type as TransactionType,
      asset: e.asset,
      quantity: e.quantity,
      eurValue: e.eurValue,
      eurFee: e.eurFee,
      eurRate: e.eurRate ?? 0,
      processed: e.processed,
    }));

    const taxCalculator = getTaxCalculationService();
    const taxYear = parsedYear;

    const taxResult = taxCalculator.calculateTaxForYear(
      transactions.filter((t) => t.type !== TransactionType.deposit),
      taxYear,
    );

    const taxRecords = Array.from(taxResult.assetCalculations.values())
      .flatMap((calc) => calc.transactions)
      .sort((a, b) => a.date.toMillis() - b.date.toMillis());

    const totalGain = taxRecords
      .filter((t) => !t.isTaxFree && t.gainLoss >= 0)
      .reduce((sum, t) => sum + t.gainLoss, 0);
    const totalLoss = taxRecords
      .filter((t) => !t.isTaxFree && t.gainLoss < 0)
      .reduce((sum, t) => sum + Math.abs(t.gainLoss), 0);

    const serializedTransactions = taxRecords.map((tx) => ({
      ...tx,
      date: toISOString(tx.date) ?? "",
    }));

    return res.json({
      year: taxYear,
      transactions: serializedTransactions,
      totalGain,
      totalLoss,
      totalStakingRewards: taxResult.stakingRewardsExempt + taxResult.stakingRewardsTaxable,
      stakingRewardsExempt: taxResult.stakingRewardsExempt,
      stakingRewardsTaxable: taxResult.stakingRewardsTaxable,
      lossCarryover: taxResult.lossCarryover,
    });
  } catch (error) {
    console.error("Tax calculation failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/:id/tax/export", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const accountId = Number.parseInt(req.params.id as string, 10);

    if (Number.isNaN(accountId) || accountId <= 0) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const yearParam = req.query.year as string | undefined;
    const year = yearParam ? Number.parseInt(yearParam, 10) : DateTime.now().year;

    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: "Invalid year" });
    }

    const transactionsRepository = getTransactionsRepository();
    const accountsService = getAccountsService();
    const taxService = getTaxCalculationService();
    const csvExportService = getWisoCsvExportService();

    const account = await accountsService.findById(payload.userId, accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const transactionEntities = await transactionsRepository.findByProviderAccountId(payload.userId, accountId);

    const transactions = transactionEntities.map((e) => ({
      id: e.id,
      providerAccountId: e.providerAccountId,
      externalId: e.externalId,
      timestamp: e.timestamp,
      type: e.type as TransactionType,
      asset: e.asset,
      quantity: e.quantity,
      eurValue: e.eurValue,
      eurFee: e.eurFee,
      eurRate: e.eurRate ?? 0,
      processed: e.processed,
    }));

    const taxResult = taxService.calculateTaxForYear(transactions, year);

    if (taxResult.assetCalculations.size === 0) {
      return res.status(404).json({ error: "No tax calculations found for this year" });
    }

    const csvContent = csvExportService.generateCsv(taxResult.assetCalculations, year, account.provider);

    const filename = `wiso_tax_export_${account.provider}_${year}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to export tax data",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

	router.get("/:id/portfolio-history", async (req: Request, res: Response) => {
	const userId = await getUserIdFromRequest(req);
	if (!userId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		const accountId = Number.parseInt(req.params.id as string, 10);

		if (isNaN(accountId)) {
			return res.status(400).json({ error: "Invalid account ID" });
		}

		const daysParam = req.query.days as string | undefined;
		const days = daysParam ? Number.parseInt(daysParam, 10) : 30;

		if (isNaN(days) || days < 1 || days > 3650) {
			return res.status(400).json({ error: "Days must be between 1 and 3650" });
		}

		const snapshotsService = getAssetHoldingsService();

		const result = await snapshotsService.getPortfolioHistoryWithPrices(userId, accountId, { days });

		return res.json(result);
	} catch (error) {
		console.error("Portfolio history failed:", error);
		return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
	}
});

const apiSettingsSchema = z.object({
  apiEnabled: z.boolean(),
  apiKey: z.string().min(1).optional(),
});

router.get("/:id/api-settings", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const accountsRepository = getAccountsRepository();
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const providerConfig = getProviderConfig(account.provider);

    return res.json({
      apiEnabled: account.apiEnabled,
      hasApiKey: !!account.apiKeyEncrypted,
      lastSyncAt: account.lastSyncAt ? toISOString(account.lastSyncAt) : null,
      syncError: account.syncError,
      supportsApiSync: !!providerConfig.apiClient,
    });
  } catch (error) {
    console.error("Get API settings failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.patch("/:id/api-settings", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const validationResult = apiSettingsSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.issues[0].message });
    }

    const { apiEnabled, apiKey } = validationResult.data;

    const accountsRepository = getAccountsRepository();
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const providerConfig = getProviderConfig(account.provider);
    if (!providerConfig.apiClient) {
      return res.status(400).json({ error: "Provider does not support API sync" });
    }

    if (apiEnabled && apiKey) {
      const syncService = getApiSyncService();
      const validation = await syncService.validateApiKey(account.provider, apiKey);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || "Invalid API key" });
      }

      const wasFirstTimeSetup = !account.apiKeyEncrypted;
      account.apiKeyEncrypted = encrypt(apiKey);
      account.apiEnabled = true;
      account.syncError = null;
      await accountsRepository.save(account);

      logger.info({ accountId, wasFirstTimeSetup }, "[ApiSettings] API key saved, checking if first time setup");

      if (wasFirstTimeSetup) {
        logger.info({ accountId }, "[ApiSettings] Triggering full sync in background");
        syncService.syncAccount(accountId, userId).catch((err) => {
          logger.error({ accountId, error: err.message }, "[ApiSettings] Initial sync failed");
        });
      }

      return res.json({
        apiEnabled: true,
        hasApiKey: true,
        lastSyncAt: account.lastSyncAt ? toISOString(account.lastSyncAt) : null,
        syncError: null,
      });
    }

    account.apiEnabled = apiEnabled;

    if (!apiEnabled) {
      account.apiKeyEncrypted = null;
    }

    account.syncError = null;
    await accountsRepository.save(account);

    return res.json({
      apiEnabled: account.apiEnabled,
      hasApiKey: !!account.apiKeyEncrypted,
      lastSyncAt: account.lastSyncAt ? toISOString(account.lastSyncAt) : null,
      syncError: null,
    });
  } catch (error) {
    console.error("Update API settings failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/:id/sync", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const syncService = getApiSyncService();
    const result = await syncService.syncAccount(accountId, userId);

    return res.json(result);
  } catch (error) {
    console.error("Manual sync failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/:id/sync-status", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const syncService = getApiSyncService();
    const accountsRepository = getAccountsRepository();
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      status: syncService.isSyncing(accountId) ? "syncing" : "idle",
      lastSyncAt: account.lastSyncAt ? toISOString(account.lastSyncAt) : null,
      syncError: account.syncError,
    });
  } catch (error) {
    console.error("Get sync status failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

export default router;
