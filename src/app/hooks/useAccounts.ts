"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "../../lib/client/accounts-api";
import type { Account } from "../../lib/types";

export function useAccounts() {
  const router = useRouter();

  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      try {
        return await accountsApi.getAll();
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          router.push("/login");
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useAccount(id?: number) {
  const router = useRouter();
  const isIdValid = id !== undefined && !Number.isNaN(id);

  return useQuery({
    queryKey: ["account", id],
    queryFn: async () => {
      try {
        if (!isIdValid) {
          throw new Error("Invalid account ID");
        }
        return await accountsApi.getById(id);
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          router.push("/login");
        }
        throw err;
      }
    },
    enabled: isIdValid,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useAccountTransactions(id?: number, year?: number) {
  const router = useRouter();
  const isIdValid = id !== undefined && !Number.isNaN(id);

  return useQuery({
    queryKey: year === undefined ? ["transactions", id] : ["transactions", id, year],
    queryFn: async () => {
      try {
        if (!isIdValid) {
          throw new Error("Invalid account ID");
        }
        return await accountsApi.getTransactions(id, year);
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          router.push("/login");
        }
        throw err;
      }
    },
    enabled: isIdValid,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}
