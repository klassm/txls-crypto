import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "../lib/client/accounts-api";

export function useAccounts() {
  const navigate = useNavigate();

  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      try {
        return await accountsApi.getAll();
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          navigate("/login");
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useAccount(id?: number) {
  const navigate = useNavigate();
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
          navigate("/login");
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
  const navigate = useNavigate();
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
          navigate("/login");
        }
        throw err;
      }
    },
    enabled: isIdValid,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}
