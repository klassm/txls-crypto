import { DateTime } from "luxon";

export interface PortfolioHistoryPoint {
	date: string;
	totalEurValue: number | null;
	totalEurInvested: number;
	assets: Record<string, { amount: number; eurValue: number | null }>;
}

export interface ChangeStats {
	absolute: number;
	relative: number;
}

export function calculatePortfolioChange(
	history: PortfolioHistoryPoint[] | undefined,
	days: number
): ChangeStats | null {
	if (!history || history.length < 2) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const latestDate = DateTime.fromISO(latest.date);
	const targetDate = latestDate.minus({ days });

	let past: PortfolioHistoryPoint | null = null;
	for (let i = history.length - 1; i >= 0; i--) {
		const entryDate = DateTime.fromISO(history[i].date);
		if (entryDate <= targetDate) {
			past = history[i];
			break;
		}
	}

	if (!past || past.totalEurValue === null) return null;
	if (past.date === latest.date) return null;

	const absolute = latest.totalEurValue - past.totalEurValue;
	const relative = (absolute / past.totalEurValue) * 100;

	return { absolute, relative };
}

export function calculateOverallChange(
	latestValue: number | null,
	eurInvested: number
): ChangeStats | null {
	if (latestValue === null || eurInvested <= 0) return null;

	const absolute = latestValue - eurInvested;
	const relative = (absolute / eurInvested) * 100;

	return { absolute, relative };
}

export interface PriceHistoryPoint {
	date: string;
	priceEur: number;
}

export function calculatePriceChangeByDate(
	priceHistory: PriceHistoryPoint[],
	hours: number
): { absolute: number; relative: number } | null {
	if (!priceHistory || priceHistory.length < 2) return null;

	const latest = priceHistory[priceHistory.length - 1];
	const latestDate = DateTime.fromISO(latest.date);
	const targetDate = latestDate.minus({ hours });

	let past: PriceHistoryPoint | null = null;
	for (let i = priceHistory.length - 1; i >= 0; i--) {
		const entryDate = DateTime.fromISO(priceHistory[i].date);
		if (entryDate <= targetDate) {
			past = priceHistory[i];
			break;
		}
	}

	if (!past) return null;
	if (past.date === latest.date) return null;

	const absolute = latest.priceEur - past.priceEur;
	const relative = (absolute / past.priceEur) * 100;

	return { absolute, relative };
}
