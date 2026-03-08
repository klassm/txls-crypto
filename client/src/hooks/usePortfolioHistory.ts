import { useQuery } from "@tanstack/react-query";
import { pricesApi, portfolioApi } from "../lib/client/prices-api";

export function useLatestPrices() {
	return useQuery({
		queryKey: ["prices", "latest"],
		queryFn: () => pricesApi.getLatest(),
		staleTime: 5 * 60 * 1000,
		refetchOnMount: false,
	});
}

export function useAssetPriceHistory(asset: string, days = 30) {
	return useQuery({
		queryKey: ["prices", "history", asset, days],
		queryFn: () => pricesApi.getHistory(asset, days),
		enabled: !!asset,
		staleTime: 5 * 60 * 1000,
		refetchOnMount: false,
	});
}

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
