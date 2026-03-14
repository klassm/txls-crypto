import { parse } from "csv-parse/sync";
import { z } from "zod";
import { logger } from "../../common/logger.js";
import { Transaction, TransactionType } from "@txls/shared";
import type { CsvImporter, CsvImportResult } from "../types.js";
import { DateTime } from "luxon";

export class ImportError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

const BitpandaRowSchema = z.object({
  "Transaction ID": z.string().min(1, "Transaction ID is required"),
  Timestamp: z.string().min(1, "Timestamp is required"),
  "Transaction Type": z.string().min(1, "Transaction Type is required"),
  "In/Out": z.string().min(1, "In/Out is required"),
  "Amount Fiat": z.string().or(z.literal("")),
  Fiat: z.string(),
  "Amount Asset": z.string().or(z.literal("")),
  Asset: z.string(),
  "Asset market price": z.string().or(z.literal("")),
  "Asset market price currency": z.string(),
  "Asset class": z.string(),
  "Product ID": z.string(),
  Fee: z.string().or(z.literal("")).or(z.undefined()),
  "Fee asset": z.string().or(z.literal("")).or(z.undefined()),
  "Fee percent": z.string().or(z.literal("")).or(z.undefined()),
  Spread: z.string().or(z.undefined()),
  "Spread Currency": z.string().or(z.undefined()),
  "Tax Fiat": z.string().or(z.literal("")).or(z.undefined()),
});

type BitpandaRow = z.infer<typeof BitpandaRowSchema>;

export class BitpandaImporter implements CsvImporter {
  parseCsv(csvContent: string, accountId: number): CsvImportResult {
    logger.info({
      accountId,
      message: "Starting Bitpanda CSV parse",
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
      const stripped = trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed;
      return stripped.startsWith("Transaction ID");
    });

    if (headerRowIndex === -1) {
      throw new ImportError(
        "Invalid CSV format: Could not find 'Transaction ID' header. Please ensure this is a Bitpanda CSV export.",
      );
    }

    const dataLines = lines.slice(headerRowIndex + 1);
const csvContentWithHeader = [lines[headerRowIndex], ...dataLines].join("\n");

    const records = parse(csvContentWithHeader, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      quote: '"',
      escape: '"',
    }) as unknown[];

    logger.debug({
      accountId,
      csvLength: csvContent.length,
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
        const parsedRow = BitpandaRowSchema.safeParse(record);

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

    

    logger.info({
      accountId,
      csvLength: csvContent.length,
      totalTransactions: transactions.length,
      validationErrors: validationErrors.length,
    });

    return {
      transactions,
      validationErrors,
    };
  }

  private createTransaction(
    row: BitpandaRow,
    accountId: number,
  ): Transaction | null {
    const transactionType = row["Transaction Type"];
    const asset = row["Asset"];
    const assetClass = row["Asset class"];
    const inOut = row["In/Out"];

    if (asset === "BCPEUR" || asset === "EUR" || assetClass === "Fiat") {
      logger.debug({ accountId, externalId: row["Transaction ID"] }, "Skipping EUR/Fiat transaction");
      return null;
    }

    if (transactionType === "transfer(stake)" || transactionType === "transfer(unstake)") {
      logger.debug({ accountId, externalId: row["Transaction ID"], type: transactionType }, "Skipping stake/unstake transfer");
      return null;
    }

    const type = this.mapTransactionType(transactionType, inOut);
    if (!type) {
      throw new ImportError(`Type: ${transactionType} (${row["Transaction ID"]})`);
    }

    let quantity = this.parseNumber(row["Amount Asset"] ?? "") ?? 0;
    let eurValue = this.parseNumber(row["Amount Fiat"] ?? "") ?? 0;
    const eurFee = this.parseNumber(row["Fee"] ?? "") || 0;

    if (quantity === 0 && eurValue === 0) {
      return null;
    }

    if (type === TransactionType.deposit) {
      quantity = eurValue;
    }

    return {
      id: 0,
      providerAccountId: accountId,
      externalId: row["Transaction ID"],
      timestamp: this.parseTimestamp(row["Timestamp"]),
      type,
      asset: row["Asset"],
      quantity: Math.abs(quantity),
      eurValue: Math.abs(eurValue),
      eurFee: Math.abs(eurFee),
      eurRate: this.parseNumber(row["Asset market price"] ?? "") ?? 0,
      processed: false,
    };
  }

  private mapTransactionType(bitpandaType: string, inOut?: string): TransactionType | null {
    const normalisedType = bitpandaType.toLowerCase().trim();
    
    if (normalisedType === "transfer") {
      return inOut === "outgoing" ? TransactionType.withdrawal : TransactionType.deposit;
    }
    
    const typeMap: Record<string, TransactionType> = {
      buy: TransactionType.buy,
      sell: TransactionType.sell,
      deposit: TransactionType.deposit,
      withdrawal: TransactionType.withdrawal,
      reward: TransactionType.reward,
    };

    return typeMap[normalisedType] ?? null;
  }

  private parseNumber(value: string): number | null {
    if (!value || value.trim() === "") {
      return null;
    }

    const cleaned = value.replace(/\s/g, "");
    
    let normalized = cleaned;
    if (cleaned.includes(",") && cleaned.includes(".")) {
      const lastCommaIndex = cleaned.lastIndexOf(",");
      const lastDotIndex = cleaned.lastIndexOf(".");
      if (lastDotIndex > lastCommaIndex) {
        normalized = cleaned.replace(/,/g, "");
      } else {
        normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
      }
    } else if (cleaned.includes(",")) {
      normalized = cleaned.replace(/,/g, ".");
    }

    const num = Number.parseFloat(normalized);
    return Number.isNaN(num) ? null : num;
  }

  private parseTimestamp(value: string): DateTime {
    let dt = DateTime.fromISO(value);
    if (!dt.isValid) {
      dt = DateTime.fromFormat(value, "yyyy-MM-dd HH:mm:ss");
    }
    if (!dt.isValid) {
      throw new ImportError(`Invalid timestamp format: ${value}`);
    }
    return dt;
  }
}