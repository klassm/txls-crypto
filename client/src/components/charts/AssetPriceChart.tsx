"use client";

import { Box, Typography, useTheme } from "@mui/material";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import type { PriceHistoryPoint } from "../../lib/client/prices-api";

interface AssetPriceChartProps {
	data: PriceHistoryPoint[];
	asset: string;
	height?: number;
}

export function AssetPriceChart({ data, asset, height = 150 }: AssetPriceChartProps) {
	const theme = useTheme();

	const hasData = data.length > 0;

	if (!hasData) {
		return (
			<Box
				sx={{
					height,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					bgcolor: "action.hover",
					borderRadius: 1,
				}}
			>
				<Typography variant="body2" color="text.secondary">
					No price data for {asset}
				</Typography>
			</Box>
		);
	}

	const minValue = Math.min(...data.map((d) => d.priceEur));
	const maxValue = Math.max(...data.map((d) => d.priceEur));
	const padding = (maxValue - minValue) * 0.1 || 10;

	return (
		<Box sx={{ width: "100%" }}>
			<Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
				{asset} Price
			</Typography>
			<Box sx={{ width: "100%", height }}>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart
						data={data}
						margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke={theme.palette.divider}
						/>
						<XAxis
							dataKey="date"
							tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
							tickFormatter={(value) => {
								const date = new Date(value);
								return date.toLocaleDateString("de-DE", {
									day: "2-digit",
									month: "2-digit",
								});
							}}
							stroke={theme.palette.divider}
						/>
						<YAxis
							tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
							tickFormatter={(value) =>
								`€${value.toLocaleString("de-DE", {
									maximumFractionDigits: 0,
								})}`
							}
							stroke={theme.palette.divider}
							domain={[minValue - padding, maxValue + padding]}
							width={50}
						/>
						<Tooltip
							contentStyle={{
								backgroundColor: theme.palette.background.paper,
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: theme.shape.borderRadius,
								fontSize: 12,
							}}
							labelFormatter={(label) => {
								const date = new Date(label);
								return date.toLocaleDateString("de-DE", {
									day: "2-digit",
									month: "2-digit",
									year: "numeric",
								});
							}}
							formatter={(value) =>
								`€${Number(value).toLocaleString("de-DE", { minimumFractionDigits: 2 })}`
							}
						/>
						<Line
							type="monotone"
							dataKey="priceEur"
							stroke={theme.palette.secondary.main}
							strokeWidth={2}
							dot={false}
							activeDot={{ r: 4 }}
						/>
					</LineChart>
				</ResponsiveContainer>
			</Box>
		</Box>
	);
}
