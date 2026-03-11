import { Card, Grid, Typography } from "@mui/material";
import type { PortfolioHistoryPoint } from "../../lib/client/prices-api";

interface ChangeStats {
	absolute: number;
	relative: number;
}

function calculateChange(
	history: PortfolioHistoryPoint[] | undefined,
	days: number
): ChangeStats | null {
	if (!history || history.length < 2) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const pastIndex = history.length - 1 - days;
	if (pastIndex < 0) return null;

	const past = history[pastIndex];
	if (past.totalEurValue === null) return null;

	const absolute = latest.totalEurValue - past.totalEurValue;
	const relative = (absolute / past.totalEurValue) * 100;

	return { absolute, relative };
}

interface AccountStatsProps {
	history: PortfolioHistoryPoint[] | undefined;
}

export function AccountStats({ history }: AccountStatsProps) {
	if (!history || history.length === 0) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const dayChange = calculateChange(history, 1);
	const weekChange = calculateChange(history, 7);
	const monthChange = calculateChange(history, 30);

	const overallChange = history.length >= 2 && history[0].totalEurValue !== null
		? {
				absolute: latest.totalEurValue - history[0].totalEurValue,
				relative: ((latest.totalEurValue - history[0].totalEurValue) / history[0].totalEurValue) * 100,
			}
		: null;

	const formatValue = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);

	const formatChange = (change: ChangeStats | null) => {
		if (!change) return { value: "-", sub: "-", color: "text.secondary" };
		const sign = change.absolute >= 0 ? "+" : "";
		const color = change.absolute >= 0 ? "success.main" : "error.main";
		return {
			value: `${sign}${formatValue(change.absolute)}`,
			sub: `${sign}${change.relative.toFixed(2)}%`,
			color,
		};
	};

	const dayFormatted = formatChange(dayChange);
	const weekFormatted = formatChange(weekChange);
	const monthFormatted = formatChange(monthChange);
	const overallFormatted = formatChange(overallChange);

	return (
		<Grid container spacing={2}>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						Overall
					</Typography>
					<Typography variant="body1" fontWeight={600} sx={{ color: overallFormatted.color }}>
						{overallFormatted.value}
					</Typography>
					<Typography variant="caption" sx={{ color: overallFormatted.color }}>
						{overallFormatted.sub}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						24h
					</Typography>
					<Typography variant="body1" fontWeight={600} sx={{ color: dayFormatted.color }}>
						{dayFormatted.value}
					</Typography>
					<Typography variant="caption" sx={{ color: dayFormatted.color }}>
						{dayFormatted.sub}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						7d
					</Typography>
					<Typography variant="body1" fontWeight={600} sx={{ color: weekFormatted.color }}>
						{weekFormatted.value}
					</Typography>
					<Typography variant="caption" sx={{ color: weekFormatted.color }}>
						{weekFormatted.sub}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						30d
					</Typography>
					<Typography variant="body1" fontWeight={600} sx={{ color: monthFormatted.color }}>
						{monthFormatted.value}
					</Typography>
					<Typography variant="caption" sx={{ color: monthFormatted.color }}>
						{monthFormatted.sub}
					</Typography>
				</Card>
			</Grid>
		</Grid>
	);
}
