import { apiUrl } from "../api-base";

interface ApiError {
	statusCode: number;
	message: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(apiUrl(url), {
		credentials: "include",
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

export interface PortfolioHistoryPoint {
	date: string;
	totalEurValue: number | null;
	assets: Record<string, { amount: number; eurValue: number | null }>;
}

export interface AssetPriceHistoryPoint {
	date: string;
	priceEur: number;
}

export interface AssetOverview {
	asset: string;
	amount: number;
	eurValue: number | null;
	eurInvested: number;
	priceHistory: AssetPriceHistoryPoint[];
	positionHistory: { date: string; value: number | null }[];
}

export interface AccountOverview {
	accountId: number;
	provider: string;
	eurValue: number | null;
}

export interface PortfolioOverview {
	portfolioHistory: PortfolioHistoryPoint[];
	assets: AssetOverview[];
	accounts: AccountOverview[];
}

export const portfolioApi = {
	getAccountHistory: (accountId: number, days = 30) =>
		fetchJson<PortfolioHistoryPoint[]>(
			`/api/accounts/${accountId}/portfolio-history?days=${days}`
		),

	getAllHistory: (days = 30) =>
		fetchJson<PortfolioHistoryPoint[]>(
			`/api/accounts/portfolio-history?days=${days}`
		),

	getOverview: (days = 30) =>
		fetchJson<PortfolioOverview>(`/api/portfolio/overview?days=${days}`),

	getAssetPriceHistory: (asset: string, days = 30) =>
		fetchJson<AssetPriceHistoryPoint[]>(`/api/prices/${asset}/history?days=${days}`),
};
