"use client";

import { Box, Card, Grid, Typography, Divider } from "@mui/material";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssetPriceChart } from "../charts/AssetPriceChart";
import { PositionChart } from "../charts/PositionChart";
import { ChartDialog, type TimeSpan } from "../charts/ChartDialog";
import { ExpandButton } from "../charts/ExpandButton";
import { portfolioApi } from "../../lib/client/prices-api";
import type { AssetOverview, PriceChangeStats } from "../../lib/client/prices-api";
import { calculateOverallChange } from "@txls/shared";

interface AssetCardProps {
	asset: AssetOverview;
}

export function AssetCard({ asset }: AssetCardProps) {
	const { priceHistory: initialPriceHistory, priceChanges, amount, eurValue, eurInvested, positionHistory: initialPositionHistory } = asset;
	const [priceDialogOpen, setPriceDialogOpen] = useState(false);
	const [positionDialogOpen, setPositionDialogOpen] = useState(false);
	const [priceTimeSpan, setPriceTimeSpan] = useState<TimeSpan>(30);
	const [positionTimeSpan, setPositionTimeSpan] = useState<TimeSpan>(30);

	const priceDays = priceTimeSpan === "all" ? 3650 : priceTimeSpan;
	const { data: expandedPriceHistory } = useQuery({
		queryKey: ["asset-price", asset.asset, priceDays],
		queryFn: () => portfolioApi.getAssetPriceHistory(asset.asset, priceDays),
		enabled: priceDialogOpen,
		staleTime: 5 * 60 * 1000,
	});

	const positionDays = positionTimeSpan === "all" ? 3650 : positionTimeSpan;
	const { data: expandedPositionHistory, isFetching: isPositionHistoryLoading } = useQuery({
		queryKey: ["asset-position", asset.asset, positionDays],
		queryFn: async () => {
			const priceHistory = await portfolioApi.getAssetPriceHistory(asset.asset, positionDays);
			return priceHistory.map(p => ({
				date: p.date,
				value: amount * p.priceEur,
			}));
		},
		enabled: positionDialogOpen,
		staleTime: 5 * 60 * 1000,
	});

	if (!initialPriceHistory || initialPriceHistory.length === 0) {
		return (
			<Card sx={{ p: 2 }}>
				<Typography variant="subtitle2" fontWeight={600}>
					{asset.asset}
				</Typography>
				<Typography variant="body2" color="text.secondary">
					No price data available
				</Typography>
			</Card>
		);
	}

	const priceHistory = expandedPriceHistory || initialPriceHistory;

	const currentPrice = priceHistory[priceHistory.length - 1]?.priceEur ?? 0;
	const positionValue = eurValue ?? amount * currentPrice;

	const overallChange = calculateOverallChange(positionValue, eurInvested);

	const formatPrice = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);

	const formatChange = (change: PriceChangeStats | null) => {
		if (!change) return { value: "-", color: "text.secondary" };
		const sign = change.absolute >= 0 ? "+" : "";
		const color = change.absolute >= 0 ? "success.main" : "error.main";
		return {
			value: `${sign}${formatPrice(change.absolute)} (${sign}${change.relative.toFixed(2)}%)`,
			color,
		};
	};

	const dayFormatted = formatChange(priceChanges.day);
	const weekFormatted = formatChange(priceChanges.week);
	const monthFormatted = formatChange(priceChanges.month);

	return (
		<Card sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
			<Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
				{asset.asset}
			</Typography>

			<Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 2 }}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="caption" color="text.secondary">
						Position ({amount.toFixed(4)})
					</Typography>
					<Typography variant="body1" fontWeight={600}>
						{formatPrice(positionValue)}
					</Typography>
					{overallChange && (
						<Typography variant="caption" sx={{ color: overallChange.absolute >= 0 ? "success.main" : "error.main" }}>
							{overallChange.absolute >= 0 ? "+" : ""}{formatPrice(overallChange.absolute)} ({overallChange.relative >= 0 ? "+" : ""}{overallChange.relative.toFixed(2)}%)
						</Typography>
					)}

					{initialPositionHistory && initialPositionHistory.length > 0 && (
						<Box sx={{ mt: 1 }}>
							<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
								<ExpandButton onClick={() => setPositionDialogOpen(true)} />
							</Box>
							<Box sx={{ height: 120 }}>
								<PositionChart data={initialPositionHistory} eurInvested={eurInvested} height={120} />
							</Box>
							<ChartDialog
								open={positionDialogOpen}
								onClose={() => setPositionDialogOpen(false)}
								title={`${asset.asset} Position`}
								initialTimeSpan={positionTimeSpan}
								onTimeSpanChange={setPositionTimeSpan}
								isLoading={isPositionHistoryLoading}
							>
								<PositionChart data={expandedPositionHistory || initialPositionHistory} eurInvested={eurInvested} height={400} />
							</ChartDialog>
						</Box>
					)}
				</Box>

				<Divider orientation="vertical" flexItem />

				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="caption" color="text.secondary">
						Price
					</Typography>
					<Typography variant="body1" fontWeight={600}>
						{formatPrice(currentPrice)}
					</Typography>

					{priceHistory && priceHistory.length > 0 && (
						<Box sx={{ mt: 1 }}>
							<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
								<ExpandButton onClick={() => setPriceDialogOpen(true)} />
							</Box>
							<Box sx={{ height: 120 }}>
								<AssetPriceChart data={priceHistory} height={120} />
							</Box>
							<ChartDialog
								open={priceDialogOpen}
								onClose={() => setPriceDialogOpen(false)}
								title={`${asset.asset} Price`}
								initialTimeSpan={priceTimeSpan}
								onTimeSpanChange={setPriceTimeSpan}
							>
								<AssetPriceChart data={priceHistory} height={400} />
							</ChartDialog>
						</Box>
					)}

					<Grid container spacing={1} sx={{ mt: 0.5 }}>
						<Grid size={4}>
							<Typography variant="caption" color="text.secondary">
								24h
							</Typography>
							<Typography variant="caption" sx={{ color: dayFormatted.color, display: "block" }}>
								{dayFormatted.value}
							</Typography>
						</Grid>
						<Grid size={4}>
							<Typography variant="caption" color="text.secondary">
								7d
							</Typography>
							<Typography variant="caption" sx={{ color: weekFormatted.color, display: "block" }}>
								{weekFormatted.value}
							</Typography>
						</Grid>
						<Grid size={4}>
							<Typography variant="caption" color="text.secondary">
								30d
							</Typography>
							<Typography variant="caption" sx={{ color: monthFormatted.color, display: "block" }}>
								{monthFormatted.value}
							</Typography>
						</Grid>
					</Grid>
				</Box>
			</Box>
		</Card>
	);
}
