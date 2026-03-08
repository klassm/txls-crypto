import { Router } from "express";
import multer from "multer";
import { Request, Response } from "express";
import { getDataSource } from "../../database.js";
import { AccountsRepository } from "../../modules/accounts/accounts.repository.js";
import { AccountsService } from "../../modules/accounts/accounts.service.js";
import { TransactionsRepository } from "../../modules/transactions/transactions.repository.js";
import { TransactionsService } from "../../modules/transactions/transactions.service.js";
import { ImportDeduplicationService } from "../../providers/import-deduplication.service.js";
import { getProviderConfig } from "../../providers/registry.js";
import { TaxCalculationService } from "../../modules/tax/tax-calculator.service.js";
import { WisoCsvExportService } from "../../modules/tax/wiso-csv-export.service.js";
import { PortfolioSnapshotsService } from "../../modules/portfolio-snapshots/portfolio-snapshots.service.js";
import { PricesRepository } from "../../modules/prices/prices.repository.js";
import { TransactionType } from "@txls/shared";
import { toISOString } from "../../utils/date.js";
import { DateTime } from "luxon";
import { getUserIdFromRequest, verifyToken, AUTH_COOKIE_NAME } from "../../utils/session.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  const accountsService = new AccountsService(undefined, dataSource);
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

  const dataSource = await getDataSource();
  const accountsService = new AccountsService(undefined, dataSource);
  const account = await accountsService.create(userId, req.body);
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

	const dataSource = await getDataSource();
	try {
		const daysParam = req.query.days as string | undefined;
		const days = daysParam ? Number.parseInt(daysParam, 10) : 30;

		if (isNaN(days) || days < 1 || days > 365) {
			return res.status(400).json({ error: "Days must be between 1 and 365" });
		}

		const snapshotsService = new PortfolioSnapshotsService(dataSource);
		const pricesRepository = new PricesRepository(dataSource);

		const endDate = DateTime.utc().startOf("day");
		const startDate = endDate.minus({ days });

		const snapshots = await snapshotsService.getPortfolioHistory(
			userId,
			undefined,
			startDate,
			endDate
		);

		const snapshotsByDate = new Map<string, Map<string, { amount: number; eurValue: number | null }>>();

		for (const snapshot of snapshots) {
			const dateKey = snapshot.date.toISODate() || "";
			if (!snapshotsByDate.has(dateKey)) {
				snapshotsByDate.set(dateKey, new Map());
			}

			const existing = snapshotsByDate.get(dateKey)!.get(snapshot.asset);
			const newAmount = (existing?.amount || 0) + Number(snapshot.amount);

			const pricesForDate = await pricesRepository.getPriceForDate(snapshot.asset, snapshot.date);
			const eurValue = pricesForDate ? newAmount * Number(pricesForDate.priceEur) : null;

			snapshotsByDate.get(dateKey)!.set(snapshot.asset, {
				amount: newAmount,
				eurValue,
			});
		}

		const result: Array<{
			date: string;
			totalEurValue: number | null;
			assets: Record<string, { amount: number; eurValue: number | null }>;
		}> = [];

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

			result.push({ date, totalEurValue, assets: assetsObj });
		}

		result.sort((a, b) => a.date.localeCompare(b.date));

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

  const dataSource = await getDataSource();
  const accountId = Number.parseInt(req.params.id as string, 10);

  if (isNaN(accountId)) {
    return res.status(400).json({ error: "Invalid account ID" });
  }

  const accountsService = new AccountsService(undefined, dataSource);
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

  const dataSource = await getDataSource();
  const accountId = Number.parseInt(req.params.id as string, 10);

  if (isNaN(accountId)) {
    return res.status(400).json({ error: "Invalid account ID" });
  }

  const accountsService = new AccountsService(undefined, dataSource);
  await accountsService.delete(userId, accountId);

  return res.json({ success: true });
});

router.get("/:id/transactions", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
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

    const accountsRepository = new AccountsRepository(dataSource);
    const accountsService = new AccountsService(accountsRepository, dataSource);
    const account = await accountsService.findById(userId, accountId);

    const transactionsRepository = new TransactionsRepository(dataSource);
    const transactionsService = new TransactionsService(transactionsRepository);

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

  const dataSource = await getDataSource();
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

    const accountsRepository = new AccountsRepository(dataSource);
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
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

    const deduplicationService = new ImportDeduplicationService(dataSource, userId);
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

const repository = new TransactionsRepository(dataSource);
		const transactionsService = new TransactionsService(repository);

		const importResult = await transactionsService.importTransactions(userId, accountId, transactions);

    if (importResult.imported > 0 && transactions.length > 0) {
      const earliestTx = transactions.reduce((earliest, tx) => {
        const txTime = tx.timestamp instanceof DateTime ? tx.timestamp : DateTime.fromISO(tx.timestamp as unknown as string);
        const earliestTime = earliest.timestamp instanceof DateTime ? earliest.timestamp : DateTime.fromISO(earliest.timestamp as unknown as string);
        return txTime < earliestTime ? tx : earliest;
      });

      const earliestTime = earliestTx.timestamp instanceof DateTime 
        ? earliestTx.timestamp 
        : DateTime.fromISO(earliestTx.timestamp as unknown as string);

const snapshotsService = new PortfolioSnapshotsService(dataSource);
		await snapshotsService.rebuildFromDate(
			userId,
			accountId,
			earliestTime.startOf("day"),
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

router.get("/:id/tax", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
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

    const repository = new TransactionsRepository(dataSource);
    const transactionEntities = await repository.findByProviderAccountId(userId, accountId);

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
      processed: e.processed,
    }));

    const taxCalculator = new TaxCalculationService();
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

    const dataSource = await getDataSource();
    const transactionsRepository = new TransactionsRepository(dataSource);
    const accountsService = new AccountsService(undefined, dataSource);
    const taxService = new TaxCalculationService();
    const csvExportService = new WisoCsvExportService();

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

	const dataSource = await getDataSource();
	try {
		const accountId = Number.parseInt(req.params.id as string, 10);

		if (isNaN(accountId)) {
			return res.status(400).json({ error: "Invalid account ID" });
		}

		const daysParam = req.query.days as string | undefined;
		const days = daysParam ? Number.parseInt(daysParam, 10) : 30;

		if (isNaN(days) || days < 1 || days > 365) {
			return res.status(400).json({ error: "Days must be between 1 and 365" });
		}

		const snapshotsService = new PortfolioSnapshotsService(dataSource);
		const pricesRepository = new PricesRepository(dataSource);

		const endDate = DateTime.utc().startOf("day");
		const startDate = endDate.minus({ days });

		const snapshots = await snapshotsService.getPortfolioHistory(
			userId,
			accountId,
			startDate,
			endDate
		);

		const snapshotsByDate = new Map<string, Map<string, { amount: number; eurValue: number | null }>>();

		const allAssets = new Set<string>();
		for (const snapshot of snapshots) {
			allAssets.add(snapshot.asset);
		}

		for (const snapshot of snapshots) {
			const dateKey = snapshot.date.toISODate() || "";
			if (!snapshotsByDate.has(dateKey)) {
				snapshotsByDate.set(dateKey, new Map());
			}

			const pricesForDate = await pricesRepository.getPriceForDate(snapshot.asset, snapshot.date);
			const eurValue = pricesForDate ? Number(snapshot.amount) * Number(pricesForDate.priceEur) : null;

			snapshotsByDate.get(dateKey)!.set(snapshot.asset, {
				amount: Number(snapshot.amount),
				eurValue,
			});
		}

		const result: Array<{
			date: string;
			totalEurValue: number | null;
			assets: Record<string, { amount: number; eurValue: number | null }>;
		}> = [];

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

			result.push({ date, totalEurValue, assets: assetsObj });
		}

		result.sort((a, b) => a.date.localeCompare(b.date));

		return res.json(result);
	} catch (error) {
		console.error("Portfolio history failed:", error);
		return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
	}
});

export default router;
