"use client";

import { Box, Card, Typography, Stack, useTheme } from "@mui/material";
import {
	PieChart,
	Pie,
	Cell,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import type { PortfolioHistoryPoint } from "../../lib/client/prices-api";

interface AssetDistributionSummaryProps {
	history: PortfolioHistoryPoint[] | undefined;
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

export function AssetDistributionSummary({ history }: AssetDistributionSummaryProps) {
	const theme = useTheme();

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

	return (
		<Card sx={{ p: 2, height: "100%" }}>
			<Typography variant="h6" sx={{ mb: 2 }}>
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

			<Box sx={{ width: "100%", height: 200, mb: 2 }}>
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie
							data={assetData}
							dataKey="value"
							nameKey="asset"
							cx="50%"
							cy="50%"
							outerRadius={70}
							innerRadius={40}
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

			<Stack spacing={1}>
				{assetData.map((item, index) => {
					const percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
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
							<Box sx={{ textAlign: "right" }}>
								<Typography variant="body2" fontWeight={500}>
									{formatValue(item.value)}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{percentage.toFixed(1)}%
								</Typography>
							</Box>
						</Box>
					);
				})}
			</Stack>
		</Card>
	);
}
