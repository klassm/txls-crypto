import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import type { Transaction } from "@/lib/types";
import { TransactionType } from "@/lib/types";
import { TaxCalculationService } from "@/server/modules/tax/tax-calculator.service";
import { TransactionsRepository } from "@/server/modules/transactions/transactions.repository";
import { AccountsRepository } from "@/server/modules/accounts/accounts.repository";
import { toISOString } from "@/lib/utils/date";
import { getUserIdFromRequest } from "@/lib/utils/session";
import { DateTime } from "luxon";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const currentYear = DateTime.now().year;

    if (!yearParam) {
      return NextResponse.json(
        { error: "Year parameter is required" },
        { status: 400 },
      );
    }

    const parsedYear = Number.parseInt(yearParam, 10);
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
      return NextResponse.json(
        { error: `Invalid year. Must be between 2000 and ${currentYear}` },
        { status: 400 },
      );
    }

    const year = parsedYear;

    const transactionsRepository = new TransactionsRepository(dataSource);
    const accountsRepository = new AccountsRepository(dataSource);

    const accounts = await accountsRepository.findAll(userId);

    const mapEntityToTransaction = (e: any): Transaction => ({
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

    return NextResponse.json({
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}