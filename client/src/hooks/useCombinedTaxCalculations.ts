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

async function fetchTaxJson<T>(url: string): Promise<T> {
  const response = await fetch(apiUrl(url), { credentials: "include" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
    }));
    throw error;
  }
  return response.json();
}

export function useTaxYears() {
  return useQuery({
    queryKey: ["tax", "years"],
    queryFn: async () => {
      const data = await fetchTaxJson<{ years: number[] }>("/api/tax/years");
      return data.years;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}

export function useCombinedTaxCalculations(year: number) {
  return useQuery({
    queryKey: ["tax", "combined", year],
    queryFn: async () => {
      const data = await fetchTaxJson<CombinedTaxResult>(`/api/tax?year=${year}`);
      return {
        ...data,
        totalStakingRewards: data.stakingRewardsExempt + data.stakingRewardsTaxable,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}
