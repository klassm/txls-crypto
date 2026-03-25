import type { Transaction } from "@txls/shared";

export interface CsvImportResult {
  transactions: Transaction[];
  validationErrors: string[];
}

export interface CsvImporter {
  parseCsv(csvContent: string, accountId: number): CsvImportResult;
}

export interface ApiSyncResult {
  transactions: Transaction[];
  wasIncremental: boolean;
}

export interface ApiSyncClient {
  fetchTransactions(apiKey: string, knownExternalIds?: Set<string>): Promise<ApiSyncResult>;
  testConnection(apiKey: string): Promise<boolean>;
}

export interface ProviderConfig {
  csvImporter: CsvImporter | undefined;
  apiClient: ApiSyncClient | undefined;
  name: string;
  logoBackgroundColor: string;
  logoForegroundColor: string;
  logoPath: string;
  csvImportMarkdownInstructions: string;
  apiSyncMarkdownInstructions: string;
  supportsManualStaking: boolean;
}
