import { Box, Card, Grid, Typography } from "@mui/material";
import type { PortfolioHistoryPoint } from "../../lib/client/prices-api";
import { calculatePortfolioChange } from "@txls/shared";

interface ChangeStats {
	absolute: number;
	relative: number;
}

function calculateChange(
	history: PortfolioHistoryPoint[] | undefined,
	days: number
): ChangeStats | null {
	const result = calculatePortfolioChange(history, days);
	if (!result) return null;
	return result;
}

interface AccountStatsProps {
	history: PortfolioHistoryPoint[] | undefined;
	variant?: "full" | "overall";
}

export function AccountStats({ history, variant = "full" }: AccountStatsProps) {
	if (!history || history.length === 0) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const dayChange = calculateChange(history, 1);
	const weekChange = calculateChange(history, 7);
	const monthChange = calculateChange(history, 30);
	const quarterChange = calculateChange(history, 90);

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
	const quarterFormatted = formatChange(quarterChange);
	const overallFormatted = formatChange(overallChange);

	if (variant === "overall") {
		return (
			<Box sx={{ textAlign: "right" }}>
				<Typography variant="body2" color="text.secondary">
					Overall
				</Typography>
				<Typography variant="body1" fontWeight={600} sx={{ color: overallFormatted.color }}>
					{overallFormatted.value}
				</Typography>
				<Typography variant="caption" sx={{ color: overallFormatted.color }}>
					{overallFormatted.sub}
				</Typography>
			</Box>
		);
	}

	return (
		<Grid container spacing={2}>
			<Grid size={{ xs: 6 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						24h
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: dayFormatted.color }}>
						{dayFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: dayFormatted.color }}>
						{dayFormatted.sub}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						7d
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: weekFormatted.color }}>
						{weekFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: weekFormatted.color }}>
						{weekFormatted.sub}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						30d
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: monthFormatted.color }}>
						{monthFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: monthFormatted.color }}>
						{monthFormatted.sub}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						90d
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: quarterFormatted.color }}>
						{quarterFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: quarterFormatted.color }}>
						{quarterFormatted.sub}
					</Typography>
				</Card>
			</Grid>
		</Grid>
	);
}
