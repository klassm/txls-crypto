import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "../lib/client/accounts-api";

export function useTaxCalculations(accountId?: number, year?: number) {
  const navigate = useNavigate();
  const isIdValid = accountId !== undefined && !Number.isNaN(accountId) && year !== undefined;

  return useQuery({
    queryKey: ["tax", accountId, year],
    queryFn: async () => {
      try {
        if (!isIdValid) {
          throw new Error("Invalid account ID or year");
        }
        return await accountsApi.getTaxCalculations(accountId, year);
      } catch (err: any) {
        if (err.statusCode === 401 || err.statusCode === 403) {
          navigate("/login");
        }
        throw err;
      }
    },
    enabled: isIdValid,
  });
}