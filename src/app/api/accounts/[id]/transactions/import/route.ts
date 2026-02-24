import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { ImportDeduplicationService } from "@/server/sources/import-deduplication.service";
import { getProviderConfig } from "@/server/sources/registry";
import { TransactionsRepository } from "@/server/modules/transactions/transactions.repository";
import { TransactionsService } from "@/server/modules/transactions/transactions.service";
import { AccountsRepository } from "@/server/modules/accounts/accounts.repository";
import { getUserIdFromRequest } from "@/lib/utils/session";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["text/csv", "application/vnd.ms-excel", "text/plain"];

export async function POST(
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

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ message: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "File too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { message: "Invalid file type. Only CSV files are allowed" },
        { status: 400 }
      );
    }

    const csvContent = await file.text();

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json(
        { message: "File is empty" },
        { status: 400 }
      );
    }

    const accountsRepository = new AccountsRepository(dataSource);
    const account = await accountsRepository.findById(userId, accountId);

    if (!account) {
      return NextResponse.json({ message: "Account not found" }, { status: 404 });
    }

    const csvImporter = getProviderConfig(account.provider).csvImporter;
    if (!csvImporter) {
      return NextResponse.json(
        { message: "No CSV importer configured for this account" },
        { status: 500 },
      );
    }

    let parseResult;
    try {
      parseResult = csvImporter.parseCsv(csvContent, accountId);
    } catch (error) {
      if (error instanceof Error && error.name === "ImportError") {
        return NextResponse.json(
          { message: error.message, details: (error as { details?: Record<string, unknown> }).details },
          { status: 400 },
        );
      }
      throw error;
    }

    const { transactions, validationErrors } = parseResult;

    const deduplicationService = new ImportDeduplicationService(dataSource, userId);
    const dedupResult = await deduplicationService.shouldSkipOrReplace(
      accountId,
      transactions,
    );

    if (dedupResult.shouldSkip) {
      return NextResponse.json({
        imported: 0,
        skipped: dedupResult.count,
        message: "Import skipped - data matches existing records",
      });
    }

    if (transactions.length === 0) {
      return NextResponse.json({
        imported: 0,
        validationErrors,
        message: "No valid transactions imported",
      });
    }

    const repository = new TransactionsRepository(dataSource);
    const transactionsService = new TransactionsService(repository);

    const importResult = await transactionsService.importTransactions(
      accountId,
      transactions,
    );

    return NextResponse.json({
      imported: importResult.imported,
      errors: importResult.errors,
      validationErrors,
    });
  } catch (error) {
    console.error("CSV import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
