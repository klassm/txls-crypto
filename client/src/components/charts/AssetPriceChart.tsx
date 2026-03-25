"use client";

import { Box, Typography, useTheme } from "@mui/material";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import type { AssetPriceHistoryPoint } from "../../lib/client/prices-api";

interface AssetPriceChartProps {
	data: AssetPriceHistoryPoint[];
	height?: number;
}

export function AssetPriceChart({ data, height = 80 }: AssetPriceChartProps) {
	const theme = useTheme();

	const validData = data.filter((d) => d.priceEur !== null && d.priceEur !== undefined);
	if (validData.length === 0) {
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
					No price data
				</Typography>
			</Box>
		);
	}

	const values = validData.map((d) => d.priceEur);
	const minValue = Math.min(...values);
	const maxValue = Math.max(...values);
	const padding = (maxValue - minValue) * 0.1 || 10;

	return (
		<Box sx={{ width: "100%", height }}>
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={validData} margin={{ top: 5, right: 5, left: 35, bottom: 20 }}>
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
						tickLine={false}
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
						width={30}
						tickLine={false}
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
							return `${date.toLocaleDateString("de-DE", {
								day: "2-digit",
								month: "2-digit",
								year: "numeric",
							})} ${date.toLocaleTimeString("de-DE", {
								hour: "2-digit",
								minute: "2-digit",
							})}`;
						}}
						formatter={(value) =>
							`€${Number(value).toLocaleString("de-DE", { minimumFractionDigits: 2 })}`
						}
					/>
					<Line
						type="monotone"
						dataKey="priceEur"
						stroke={theme.palette.primary.main}
						strokeWidth={1.5}
						dot={false}
						activeDot={{ r: 4 }}
					/>
				</LineChart>
			</ResponsiveContainer>
		</Box>
	);
}
