import { apiUrl } from "../api-base";

interface ApiError {
	statusCode: number;
	message: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(apiUrl(url), {
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
		...options,
	});

	if (!response.ok) {
		const error: ApiError = await response.json().catch(() => ({
			statusCode: response.status,
			message: response.statusText,
		}));
		throw error;
	}

	return response.json();
}

export interface PriceHistoryPoint {
	date: string;
	priceEur: number;
}

export interface LatestPrice {
	priceEur: number;
	fetchedAt: string;
}

export interface PortfolioHistoryPoint {
	date: string;
	totalEurValue: number | null;
	assets: Record<string, { amount: number; eurValue: number | null }>;
}

export const pricesApi = {
	getLatest: () =>
		fetchJson<Record<string, LatestPrice>>("/api/prices/latest"),

	getHistory: (asset: string, days = 30) =>
		fetchJson<PriceHistoryPoint[]>(`/api/prices/${asset}/history?days=${days}`),

	getLatestForAsset: (asset: string) =>
		fetchJson<{ asset: string; priceEur: number; fetchedAt: string }>(
			`/api/prices/${asset}/latest`
		),
};

export const portfolioApi = {
	getAccountHistory: (accountId: number, days = 30) =>
		fetchJson<PortfolioHistoryPoint[]>(
			`/api/accounts/${accountId}/portfolio-history?days=${days}`
		),

	getAllHistory: (days = 30) =>
		fetchJson<PortfolioHistoryPoint[]>(
			`/api/accounts/portfolio-history?days=${days}`
		),
};
