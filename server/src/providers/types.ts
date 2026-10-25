import type { Transaction } from '@txls/shared'

export interface CsvImportResult {
	transactions: Transaction[]
	validationErrors: string[]
}

export interface CsvImporter {
	parseCsv(csvContent: string, accountId: number): CsvImportResult
}

export interface ApiSyncResult {
	transactions: Transaction[]
}

/** A single asset's total balance as reported by the provider (symbol + quantity). */
export interface ProviderBalance {
	asset: string
	quantity: number
}

export interface ApiSyncClient {
	fetchTransactions(apiKey: string): Promise<ApiSyncResult>
	testConnection(apiKey: string): Promise<boolean>
	// Optional reconciliation hook: returns current provider-side asset
	// balances so the sync service can compare them against its own holdings.
	fetchBalances?(apiKey: string): Promise<ProviderBalance[]>
}

export interface ProviderConfig {
	csvImporter: CsvImporter | undefined
	apiClient: ApiSyncClient | undefined
	name: string
	logoBackgroundColor: string
	logoForegroundColor: string
	logoPath: string
	csvImportMarkdownInstructions: string
	apiSyncMarkdownInstructions: string
	supportsManualStaking: boolean
}
