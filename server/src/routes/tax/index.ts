import { Router, Request, Response } from "express";
import { getDataSource } from "../../database.js";
import { AccountsRepository } from "../../modules/accounts/accounts.repository.js";
import { TransactionsRepository } from "../../modules/transactions/transactions.repository.js";
import { TransactionType } from "@txls/shared";
import { TaxCalculationService } from "../../modules/tax/tax-calculator.service.js";
import { toISOString } from "../../utils/date.js";
import { DateTime } from "luxon";
import { getUserIdFromRequest } from "../../utils/session.js";

const router = Router();

router.get("/years", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  try {
    const transactionsRepository = new TransactionsRepository(dataSource);
    const accountsRepository = new AccountsRepository(dataSource);

    const accounts = await accountsRepository.findAll(userId);
    const currentYear = DateTime.now().year;

    const yearsSet = new Set<number>();
    yearsSet.add(currentYear);

    for (const account of accounts) {
      const transactions = await transactionsRepository.findByProviderAccountId(userId, account.id);
      for (const tx of transactions) {
        const year = tx.timestamp.year;
        yearsSet.add(year);
      }
    }

    const years = Array.from(yearsSet).sort((a, b) => b - a);
    return res.json({ years });
  } catch (error) {
    console.error("Failed to get tax years:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  try {
    const yearParam = req.query.year as string;
    const currentYear = DateTime.now().year;

    if (!yearParam) {
      return res.status(400).json({ error: "Year parameter is required" });
    }

    const parsedYear = Number.parseInt(yearParam, 10);
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
      return res.status(400).json({ error: `Invalid year. Must be between 2000 and ${currentYear}` });
    }

    const year = parsedYear;

    const transactionsRepository = new TransactionsRepository(dataSource);
    const accountsRepository = new AccountsRepository(dataSource);

    const accounts = await accountsRepository.findAll(userId);

    const mapEntityToTransaction = (e: any) => ({
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
    });

    const allTransactions = (
      await Promise.all(
        accounts.map((account) =>
          transactionsRepository.findByProviderAccountId(userId, account.id)
            .then((entities) => entities.map(mapEntityToTransaction))
        )
      )
    ).flat();

    const taxCalculator = new TaxCalculationService();
    const taxYear = year;

    const taxResult = taxCalculator.calculateTaxForYear(
      allTransactions.filter((t) => t.type !== TransactionType.deposit),
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
      stakingRewards: taxResult.stakingRewardsExempt + taxResult.stakingRewardsTaxable,
      stakingRewardsExempt: taxResult.stakingRewardsExempt,
      stakingRewardsTaxable: taxResult.stakingRewardsTaxable,
      lossCarryover: taxResult.lossCarryover,
      includedAccounts: accounts.map((a) => ({
        id: a.id,
        source: a.provider,
      })),
    });
  } catch (error) {
    console.error("Combined tax calculation failed:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

export default router;
