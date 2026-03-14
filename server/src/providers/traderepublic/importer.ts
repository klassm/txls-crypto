import { parse } from "csv-parse/sync";
import { z } from "zod";
import pino from "pino";
import { Transaction, TransactionType } from "@txls/shared";
import type { CsvImporter, CsvImportResult } from "../types.js";
import { DateTime } from "luxon";

const logger = pino({ level: "info" });

export class ImportError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

const TradeRepublicRowSchema = z.object({
  Date: z.string().min(1, "Date is required"),
  Type: z.string().min(1, "Type is required"),
  Value: z.string(),
  Note: z.string().or(z.literal("")),
  ISIN: z.string().or(z.literal("")),
  Shares: z.string().or(z.literal("")),
  Fees: z.string().or(z.literal("")),
  Taxes: z.string().or(z.literal("")),
  ISIN2: z.string().or(z.literal("")),
  Shares2: z.string().or(z.literal("")),
});

type TradeRepublicRow = z.infer<typeof TradeRepublicRowSchema>;

const CRYPTO_ISIN_MAP: Record<string, string> = {
  "XF000BTC0017": "BTC",
  "XF000XRP0018": "XRP",
  "XF000SOL0012": "SOL",
};

const CRYPTO_ASSET_NAMES = new Set([
  "Bitcoin",
  "XRP",
  "Solana",
  "BTC",
  "XRP",
  "SOL",
]);

export class TradeRepublicImporter implements CsvImporter {
  parseCsv(csvContent: string, accountId: number): CsvImportResult {
    logger.info({
      message: "Starting TradeRepublic CSV parse",
      accountId,
      csvLength: csvContent.length,
    });

    const lines = csvContent.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      throw new ImportError(
        "CSV file is empty or contains only header",
        { lineCount: lines.length },
      );
    }

    const headerRowIndex = lines.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("Date;Type");
    });

    if (headerRowIndex === -1) {
      throw new ImportError(
        "Invalid CSV format: Could not find 'Date;Type' header. Please ensure this is a TradeRepublic CSV export.",
      );
    }

    const dataLines = lines.slice(headerRowIndex + 1);
const csvContentWithHeader = [lines[headerRowIndex], ...dataLines].join("\n");

    const records = parse(csvContentWithHeader, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      delimiter: ";",
    }) as unknown[];

    logger.debug({
      message: "Parsed CSV rows",
      accountId,
      totalRows: records.length,
      skippedHeaderRows: headerRowIndex,
    });

    if (records.length === 0) {
      throw new ImportError(
        "No valid transaction data found in CSV file",
        { rowCount: records.length },
      );
    }

    const { transactions, validationErrors } = Array.from(
      records.entries(),
    ).reduce<{
      transactions: Transaction[];
      validationErrors: string[];
    }>(
      (acc, [index, record]) => {
        const parsedRow = TradeRepublicRowSchema.safeParse(record);

        if (!parsedRow.success) {
          const errorMsg = `Row ${index + 2}: ${parsedRow.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`;
          acc.validationErrors.push(errorMsg);
          logger.warn({ accountId, rowIndex: index + 2 }, errorMsg);
          return acc;
        }

        try {
          const transaction = this.createTransaction(
            parsedRow.data,
            accountId,
          );
          if (transaction) {
            acc.transactions.push(transaction);
          }
        } catch (error) {
          const errorMsg = `Row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`;
          acc.validationErrors.push(errorMsg);
          logger.error({ accountId, rowIndex: index + 2, error }, errorMsg);
        }

        return acc;
      },
      { transactions: [], validationErrors: [] }
    );

    if (transactions.length === 0 && validationErrors.length > 0) {
      throw new ImportError(
        "Failed to parse any transactions from CSV",
        { errorCount: validationErrors.length, errors: validationErrors },
      );
    }

    logger.info({
      message: "TradeRepublic CSV parse completed",
      accountId,
      totalTransactions: transactions.length,
      validationErrors: validationErrors.length,
    });

    return {
      transactions,
      validationErrors,
    };
  }

  private createTransaction(
    row: TradeRepublicRow,
    accountId: number,
  ): Transaction | null {
    const type = row.Type;
    const note = row.Note;
    const value = this.parseNumber(row.Value);
    const shares = this.parseNumber(row.Shares);
    const fees = this.parseNumber(row.Fees) || 0;
    const taxes = this.parseNumber(row.Taxes) || 0;
    const isin = row.ISIN;

    let transactionType: TransactionType | null = null;
    let asset: string | null = null;
    let quantity: number | null = null;
    let eurValue: number | null = null;

    if (type === "Deposit" && !isin) {
      asset = this.getAssetFromNote(note);
      if (!CRYPTO_ASSET_NAMES.has(asset)) {
        return null;
      }
      transactionType = TransactionType.reward;
      quantity = value;
      eurValue = value;
    } else if (type === "Buy") {
      transactionType = TransactionType.buy;
      asset = CRYPTO_ISIN_MAP[isin];
      quantity = shares;
      eurValue = value !== null ? Math.abs(value) : 0;
    } else if (type === "Sell") {
      transactionType = TransactionType.sell;
      asset = CRYPTO_ISIN_MAP[isin];
      quantity = shares;
      eurValue = value;
    }

    if (!transactionType || !asset || quantity === null || eurValue === null) {
      return null;
    }

    if (quantity === 0 && eurValue === 0) {
      return null;
    }

    const eurRate = quantity > 0 && eurValue > 0 ? eurValue / quantity : 0;

    return {
      id: 0,
      providerAccountId: accountId,
      externalId: `${type}-${row.Date}-${asset}-${quantity}`,
      timestamp: this.parseTimestamp(row.Date),
      type: transactionType,
      asset,
      quantity: Math.abs(quantity),
      eurValue: Math.abs(eurValue),
      eurFee: Math.abs(fees) + Math.abs(taxes),
      eurRate,
      processed: false,
    };
  }

  private getAssetFromNote(note: string): string {
    const assetName = note.split(" ")[0];
    if (assetName === "Bitcoin") return "BTC";
    if (assetName === "XRP") return "XRP";
    if (assetName === "Solana") return "SOL";
    if (assetName === "BTC") return "BTC";
    if (assetName === "XRP") return "XRP";
    if (assetName === "SOL") return "SOL";
    return assetName;
  }

  private parseNumber(value: string): number | null {
    if (!value || value.trim() === "") {
      return null;
    }

    const cleaned = value.replace(/\s/g, "");
    
    let normalized = cleaned;
    if (cleaned.includes(",") && cleaned.includes(".")) {
      normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else if (cleaned.includes(",")) {
      normalized = cleaned.replace(/,/g, ".");
    }

    const num = Number.parseFloat(normalized);
    return Number.isNaN(num) ? null : num;
  }

  private parseTimestamp(value: string): DateTime {
    const dt = DateTime.fromISO(value);
    if (!dt.isValid) {
      throw new ImportError(`Invalid timestamp format: ${value}`);
    }
    return dt;
  }
}