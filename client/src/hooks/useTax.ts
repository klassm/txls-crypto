import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "../lib/client/accounts-api";

export function useTaxCalculations(accountId?: number, year?: number) {
  const isIdValid = accountId !== undefined && !Number.isNaN(accountId) && year !== undefined;

  return useQuery({
    queryKey: ["tax", accountId, year],
    queryFn: () => accountsApi.getTaxCalculations(accountId!, year!),
    enabled: isIdValid,
  });
}
