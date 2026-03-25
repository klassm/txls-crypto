"use client";

import { Box, Card, Typography, Stack, useTheme, IconButton } from "@mui/material";
import { useState } from "react";
import {
	PieChart,
	Pie,
	Cell,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import { OpenInFull } from "@mui/icons-material";
import type { PortfolioHistoryPoint, AssetOverview } from "../../lib/client/prices-api";
import { ChartDialog, type TimeSpan } from "../charts/ChartDialog";
import { AssetPriceChart } from "../charts/AssetPriceChart";

interface AssetDistributionSummaryProps {
	history: PortfolioHistoryPoint[] | undefined;
	assets?: AssetOverview[];
}

const COLORS = [
	"#8884d8",
	"#82ca9d",
	"#ffc658",
	"#ff7300",
	"#0088fe",
	"#00c49f",
	"#ffbb28",
	"#ff8042",
	"#a4de6c",
	"#d0ed57",
];

export function AssetDistributionSummary({ history, assets }: AssetDistributionSummaryProps) {
	const theme = useTheme();
	const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
	const [chartTimeSpan, setChartTimeSpan] = useState<TimeSpan>(30);

	if (!history || history.length === 0) {
		return null;
	}

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) {
		return null;
	}

	const assetData = Object.entries(latest.assets)
		.map(([asset, data]) => ({
			asset,
			value: data.eurValue || 0,
			amount: data.amount,
		}))
		.filter((d) => d.value > 0)
		.sort((a, b) => b.value - a.value);

	if (assetData.length === 0) {
		return null;
	}

	const totalValue = latest.totalEurValue;

	const getAssetPrice = (assetSymbol: string): number | null => {
		const asset = assets?.find((a) => a.asset === assetSymbol);
		if (!asset?.priceHistory || asset.priceHistory.length === 0) return null;
		return asset.priceHistory[asset.priceHistory.length - 1]?.priceEur ?? null;
	};

	const getAssetPriceHistory = (assetSymbol: string) => {
		return assets?.find((a) => a.asset === assetSymbol)?.priceHistory ?? null;
	};

	const formatValue = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);

	const formatAmount = (amount: number) => {
		if (amount >= 1) return amount.toFixed(4);
		if (amount >= 0.0001) return amount.toFixed(8);
		return amount.toExponential(4);
	};

	const selectedAssetHistory = selectedAsset ? getAssetPriceHistory(selectedAsset) : null;

	return (
		<Card sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
			<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
				Asset Distribution
			</Typography>
			
			<Box sx={{ mb: 2 }}>
				<Typography variant="body2" color="text.secondary">
					Total Value
				</Typography>
				<Typography variant="h5" fontWeight={600}>
					{formatValue(totalValue)}
				</Typography>
			</Box>

			<Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2 }}>
				<Box sx={{ width: { xs: "100%", md: 250 }, height: 250, flexShrink: 0 }}>
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={assetData}
								dataKey="value"
								nameKey="asset"
								cx="50%"
								cy="50%"
							outerRadius={90}
							innerRadius={55}
								paddingAngle={2}
							>
								{assetData.map((_entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={COLORS[index % COLORS.length]}
									/>
								))}
							</Pie>
							<Tooltip
								contentStyle={{
									backgroundColor: theme.palette.background.paper,
									border: `1px solid ${theme.palette.divider}`,
									borderRadius: theme.shape.borderRadius,
								}}
								formatter={(value) =>
									`€${Number(value).toLocaleString("de-DE", {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}`
								}
							/>
						</PieChart>
					</ResponsiveContainer>
				</Box>

				<Stack spacing={1} sx={{ flex: 1, minWidth: 0, maxWidth: 400 }}>
				{assetData.map((item, index) => {
					const percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
					const price = getAssetPrice(item.asset);
					const hasPriceHistory = getAssetPriceHistory(item.asset) && getAssetPriceHistory(item.asset)!.length > 0;

					return (
						<Box
							key={item.asset}
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
							}}
						>
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								<Box
									sx={{
										width: 12,
										height: 12,
										borderRadius: "50%",
										bgcolor: COLORS[index % COLORS.length],
									}}
								/>
								<Box>
									<Typography variant="body2" fontWeight={500}>
										{item.asset}
									</Typography>
									<Typography variant="caption" color="text.secondary">
										{formatAmount(item.amount)}
									</Typography>
								</Box>
							</Box>
						<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
							<Box sx={{ textAlign: "right" }}>
								<Typography variant="body2" fontWeight={500}>
									{formatValue(item.value)}
								</Typography>
								{price ? (
									<Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
										<Typography variant="caption" color="text.secondary">
											{formatValue(price)}/coin
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{percentage.toFixed(1)}%
										</Typography>
									</Box>
								) : (
									<Typography variant="caption" color="text.secondary">
										{percentage.toFixed(1)}%
									</Typography>
								)}
							</Box>
							{hasPriceHistory && (
								<IconButton
									size="small"
									onClick={() => setSelectedAsset(item.asset)}
									sx={{ ml: 0.5 }}
								>
									<OpenInFull fontSize="small" />
								</IconButton>
							)}
						</Box>
						</Box>
					);
				})}
				</Stack>
			</Box>

			{selectedAsset && selectedAssetHistory && (
				<ChartDialog
					open={!!selectedAsset}
					onClose={() => setSelectedAsset(null)}
					title={`${selectedAsset} Price`}
					initialTimeSpan={chartTimeSpan}
					onTimeSpanChange={setChartTimeSpan}
				>
					<AssetPriceChart data={selectedAssetHistory} height={400} />
				</ChartDialog>
			)}
		</Card>
	);
}
