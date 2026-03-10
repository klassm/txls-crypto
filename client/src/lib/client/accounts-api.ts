import type {
  Account,
  AccountTransactionsDocument,
  ApiError,
  CreateAccountDto,
  TaxTransaction,
  UpdateAccountDto,
  YearStats,
  ApiSettings,
  UpdateApiSettingsDto,
  SyncStatus,
} from "@txls/shared";
import { apiUrl } from "../api-base";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
    }))
    throw error
  }

  return response.json()
}

export const accountsApi = {
  getAll: () => fetchJson<Account[]>('/api/accounts'),

  getById: (id: number) => fetchJson<Account>(`/api/accounts/${id}`),

  getTransactions: (id: number, year?: number) => {
    const url = year
      ? `/api/accounts/${id}/transactions?year=${year}`
      : `/api/accounts/${id}/transactions`
    return fetchJson<AccountTransactionsDocument & { stats: YearStats }>(url)
  },

  importCsv: async (accountId: number, file: File): Promise<{ imported: number; errors: string[]; validationErrors?: string[]; skipped?: number }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(apiUrl(`/api/accounts/${accountId}/transactions/import`), {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let error: ApiError
      try {
        error = JSON.parse(errorText)
      } catch {
        error = {
          statusCode: response.status,
          message: response.statusText,
        }
      }
      throw error
    }

    return response.json()
  },

  getTaxCalculations: async (accountId: number, year: number): Promise<{
    year: number;
    transactions: TaxTransaction[];
    totalGain: number;
    totalLoss: number;
    stakingRewardsExempt: number;
    stakingRewardsTaxable: number;
    totalStakingRewards: number;
    lossCarryover: {
      year: number;
      loss: number;
      remaining: number;
    };
  }> => {
    return fetchJson(`/api/accounts/${accountId}/tax?year=${year}`)
  },

  exportTaxCsv: async (accountId: number, year: number): Promise<string> => {
    const response = await fetch(apiUrl(`/api/accounts/${accountId}/tax/export?year=${year}`))

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        message: response.statusText,
      }))
      throw error
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  },

  create: (data: CreateAccountDto) =>
    fetchJson<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateAccountDto) =>
    fetchJson<Account>(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchJson<void>(`/api/accounts/${id}`, {
      method: 'DELETE',
    }),

  getApiSettings: (id: number) =>
    fetchJson<ApiSettings>(`/api/accounts/${id}/api-settings`),

  updateApiSettings: (id: number, data: UpdateApiSettingsDto) =>
    fetchJson<ApiSettings>(`/api/accounts/${id}/api-settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  triggerSync: (id: number, fullSync = false) =>
    fetchJson<{ accountId: number; success: boolean; imported: number; error?: string }>(`/api/accounts/${id}/sync?full=${fullSync}`, {
      method: 'POST',
    }),

  getSyncStatus: (id: number) =>
    fetchJson<{ status: SyncStatus; lastSyncAt: string | null; syncError: string | null }>(`/api/accounts/${id}/sync-status`),
}
