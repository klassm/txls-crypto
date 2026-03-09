import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "../lib/client/accounts-api";

export function useApiSettings(accountId: number | null) {
  return useQuery({
    queryKey: ["api-settings", accountId],
    queryFn: () => accountsApi.getApiSettings(accountId!),
    enabled: accountId !== null,
  });
}
