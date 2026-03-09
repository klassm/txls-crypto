import { useQuery } from "@tanstack/react-query";
import { portfolioApi } from "../lib/client/prices-api";

export function usePortfolioHistory(accountId?: number, days = 30) {
	return useQuery({
		queryKey: ["portfolio", "history", accountId, days],
		queryFn: () =>
			accountId
				? portfolioApi.getAccountHistory(accountId, days)
				: portfolioApi.getAllHistory(days),
		staleTime: 5 * 60 * 1000,
		refetchOnMount: false,
	});
}

export function usePortfolioOverview(days = 30) {
	return useQuery({
		queryKey: ["portfolio", "overview", days],
		queryFn: () => portfolioApi.getOverview(days),
		staleTime: 5 * 60 * 1000,
		refetchOnMount: false,
	});
}
