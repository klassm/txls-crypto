import { NextResponse } from "next/server";
import { DataSource } from "typeorm";
import { TaxCalculationService } from "@/server/modules/tax/tax-calculator.service";
import { WisoCsvExportService } from "@/server/modules/tax/wiso-csv-export.service";
import { AccountsService } from "@/server/modules/accounts/accounts.service";
import { TransactionsRepository } from "@/server/modules/transactions/transactions.repository";
import { getDataSource } from "@/lib/database";
import { DateTime } from "luxon";
import { TransactionType } from "@/lib/types";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/utils/password";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]*)`))?.[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { id } = await params;
    const accountId = Number.parseInt(id, 10);

    if (Number.isNaN(accountId) || accountId <= 0) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? Number.parseInt(yearParam, 10) : DateTime.now().year;

    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const dataSource = await getDataSource();
    const transactionsRepository = new TransactionsRepository(dataSource);
    const accountsService = new AccountsService(undefined, dataSource);
    const taxService = new TaxCalculationService();
    const csvExportService = new WisoCsvExportService();

    const account = await accountsService.findById(payload.userId, accountId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
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
      return NextResponse.json(
        { error: "No tax calculations found for this year" },
        { status: 404 },
      );
    }

    const csvContent = csvExportService.generateCsv(taxResult.assetCalculations, year, account.provider);

    const filename = `wiso_tax_export_${account.provider}_${year}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to export tax data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}