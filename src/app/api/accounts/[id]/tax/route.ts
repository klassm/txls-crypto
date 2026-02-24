import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import type { Transaction } from "@/lib/types";
import { TransactionType } from "@/lib/types";
import { TaxCalculationService } from "@/server/modules/tax/tax-calculator.service";
import { TransactionsRepository } from "@/server/modules/transactions/transactions.repository";
import { toISOString } from "@/lib/utils/date";
import { getUserIdFromRequest } from "@/lib/utils/session";
import { DateTime } from "luxon";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");

    if (!year) {
      return NextResponse.json(
        { error: "Year parameter is required" },
        { status: 400 },
      );
    }

    const currentYear = DateTime.now().year;
    const parsedYear = Number.parseInt(year, 10);
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
      return NextResponse.json(
        { error: `Invalid year. Must be between 2000 and ${currentYear}` },
        { status: 400 },
      );
    }

    const { id } = await params;
    const accountId = Number.parseInt(id, 10);

    if (isNaN(accountId) || accountId <= 0) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const repository = new TransactionsRepository(dataSource);
    const transactionEntities = await repository.findByProviderAccountId(userId, accountId);

    const transactions: Transaction[] = transactionEntities.map((e) => ({
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

    return NextResponse.json({
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}