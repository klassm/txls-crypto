import type { Transaction } from "../../types/index.js";

export interface CsvImportResult {
  transactions: Transaction[];
  validationErrors: string[];
}

export interface CsvImporter {
  parseCsv(csvContent: string, accountId: number): CsvImportResult;
}

export interface ProviderModuleConfig {
  csvImporter: CsvImporter | undefined;
  name: string;
  logoBackgroundColor: string;
  logoForegroundColor: string;
  logoPath: string;
  csvImportMarkdownInstructions: string;
}
