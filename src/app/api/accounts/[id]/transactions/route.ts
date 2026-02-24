import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { AccountsRepository } from "@/server/modules/accounts/accounts.repository";
import { AccountsService } from "@/server/modules/accounts/accounts.service";
import { TransactionsRepository } from "@/server/modules/transactions/transactions.repository";
import { TransactionsService } from "@/server/modules/transactions/transactions.service";
import { DateTime } from "luxon";
import { toISOString } from "@/lib/utils/date";
import { getUserIdFromRequest } from "@/lib/utils/session";

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
    const { id } = await params;
    const accountId = Number.parseInt(id, 10);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const currentYear = DateTime.now().year;

    if (yearParam !== null) {
      const parsedYear = Number.parseInt(yearParam, 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
        return NextResponse.json(
          { error: `Invalid year. Must be between 2000 and ${currentYear}` },
          { status: 400 },
        );
      }
    }

    const year = yearParam ? Number.parseInt(yearParam, 10) : currentYear;

    const accountsRepository = new AccountsRepository(dataSource);
    const accountsService = new AccountsService(accountsRepository, dataSource);
    const account = await accountsService.findById(userId, accountId);

    const transactionsRepository = new TransactionsRepository(dataSource);
    const transactionsService = new TransactionsService(transactionsRepository);

    const result = await transactionsService.findByProviderAccountIdWithStats(
      userId,
      accountId,
      year,
    );

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

    return NextResponse.json({
      account: serializedAccount,
      transactions: serializedTransactions,
      stats: result.stats,
      availableYears: sortedYears,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
