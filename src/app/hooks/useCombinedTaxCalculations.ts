"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { TaxTransaction } from "@/lib/types";

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

export function useCombinedTaxCalculations(year: number) {
  const router = useRouter();

  return useQuery({
    queryKey: ["tax", "combined", year],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/tax?year=${year}`);
        if (!response.ok) {
          const error = await response.json().catch(() => ({ statusCode: response.status }));
          if (error.statusCode === 401 || error.statusCode === 403) {
            router.push("/login");
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
          router.push("/login");
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
  });
}