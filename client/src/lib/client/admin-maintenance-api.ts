import { apiUrl } from "../api-base";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), {
    credentials: "include",
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
    }))
  }

  return response.json()
}

export const adminMaintenanceApi = {
  rebuildAllHoldings: () =>
    fetchJson<{ success: boolean; accountsRebuilt: number }>('/api/admin/rebuild-holdings', {
      method: 'POST',
    }),

  rebuildUserHoldings: (userId: number) =>
    fetchJson<{ success: boolean; accountsRebuilt: number }>(`/api/admin/rebuild-holdings/${userId}`, {
      method: 'POST',
    }),
}
