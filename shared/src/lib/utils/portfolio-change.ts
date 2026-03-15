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
