import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { ProvidersRepository } from "@/server/modules/providers/providers.repository";
import { ProvidersService } from "@/server/modules/providers/providers.service";
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
    const providerAccountId = Number.parseInt(id, 10);

    if (isNaN(providerAccountId)) {
      return NextResponse.json({ error: "Invalid provider account ID" }, { status: 400 });
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

    const providersRepository = new ProvidersRepository(dataSource);
    const providersService = new ProvidersService(providersRepository, dataSource);
    const provider = await providersService.findById(userId, providerAccountId);

    const transactionsRepository = new TransactionsRepository(dataSource);
    const transactionsService = new TransactionsService(transactionsRepository);

    const result = await transactionsService.findByProviderAccountIdWithStats(
      userId,
      providerAccountId,
      year,
    );

    const availableYears = await transactionsRepository.getAvailableYears(userId, providerAccountId);

    const uniqueYears = new Set([currentYear, ...availableYears]);
    const sortedYears = Array.from(uniqueYears).sort((a, b) => b - a);

    const serializedTransactions = result.transactions.map((tx) => ({
      ...tx,
      timestamp: toISOString(tx.timestamp) ?? "",
    }));

    const serializedProvider = provider ? {
      ...provider,
      createdAt: toISOString(provider.createdAt) ?? "",
      updatedAt: toISOString(provider.updatedAt) ?? "",
    } : {
      id: providerAccountId,
      type: "" as any,
      csvImportAllowed: false,
      createdAt: toISOString(DateTime.now()) ?? "",
      updatedAt: toISOString(DateTime.now()) ?? "",
    };

    return NextResponse.json({
      provider: serializedProvider,
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