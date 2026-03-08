import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { TaxTransaction } from "@txls/shared";
import { apiUrl } from "../lib/api-base";

export interface LossCarryover {
  year: number;
  loss: number;
  remaining: number;
}

export type TaxTransactionAPI = Omit<TaxTransaction, "date"> & {
  date: string;
};

export interface CombinedTaxResult {
  year: number;
  transactions: TaxTransactionAPI[];
  totalGain: number;
  totalLoss: number;
  stakingRewards: number;
  totalStakingRewards: number;
  stakingRewardsExempt: number;
  stakingRewardsTaxable: number;
  lossCarryover: LossCarryover;
  includedAccounts: Array<{ id: number; source: string }>;
}

export function useTaxYears() {
  const navigate = useNavigate();

  return useQuery({
    queryKey: ["tax", "years"],
    queryFn: async () => {
      try {
        const response = await fetch(apiUrl("/api/tax/years"), { credentials: "include" });
        if (!response.ok) {
          const error = await response.json().catch(() => ({ statusCode: response.status }));
          if (error.statusCode === 401 || error.statusCode === 403) {
            navigate("/login");
          }
          throw new Error("Failed to fetch tax years");
        }
        const data = await response.json() as { years: number[] };
        return data.years;
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

export function useCombinedTaxCalculations(year: number) {
  const navigate = useNavigate();

  return useQuery({
    queryKey: ["tax", "combined", year],
    queryFn: async () => {
      try {
        const response = await fetch(apiUrl(`/api/tax?year=${year}`));
        if (!response.ok) {
          const error = await response.json().catch(() => ({ statusCode: response.status }));
          if (error.statusCode === 401 || error.statusCode === 403) {
            navigate("/login");
          }
          throw new Error("Failed to fetch combined tax data");
        }
        const data = await response.json() as unknown as CombinedTaxResult;
        return {
          ...data,
          totalStakingRewards: data.stakingRewardsExempt + data.stakingRewardsTaxable,
        };
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