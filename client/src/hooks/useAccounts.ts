import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "../lib/client/accounts-api";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => accountsApi.getAll(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useAccount(id?: number) {
  const isIdValid = id !== undefined && !Number.isNaN(id);

  return useQuery({
    queryKey: ["account", id],
    queryFn: () => accountsApi.getById(id!),
    enabled: isIdValid,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useAccountTransactions(id?: number, year?: number) {
  const isIdValid = id !== undefined && !Number.isNaN(id);

  return useQuery({
    queryKey: year === undefined ? ["transactions", id] : ["transactions", id, year],
    queryFn: () => accountsApi.getTransactions(id!, year),
    enabled: isIdValid,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}
