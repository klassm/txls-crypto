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
	ReferenceLine,
} from "recharts";
import type { PortfolioHistoryPoint } from "../../lib/client/prices-api";

interface PortfolioValueChartProps {
	data: PortfolioHistoryPoint[];
	height?: number;
	title?: string;
}

export function PortfolioValueChart({
	data,
	height = 300,
	title,
}: PortfolioValueChartProps) {
	const theme = useTheme();

	const formattedData = data.map((point) => ({
		date: point.date,
		value: point.totalEurValue,
	}));

	const hasData = formattedData.length > 0;
	const hasNullValues = formattedData.some((d) => d.value === null);
	const nonNullData = formattedData.filter((d) => d.value !== null);

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
				<Typography color="text.secondary">No portfolio data available</Typography>
			</Box>
		);
	}

	const minValue = Math.min(...nonNullData.map((d) => d.value as number));
	const maxValue = Math.max(...nonNullData.map((d) => d.value as number));
	const padding = (maxValue - minValue) * 0.1 || 100;

	return (
		<Box sx={{ width: "100%" }}>
			{title && (
				<Typography variant="h6" sx={{ mb: 2 }}>
					{title}
				</Typography>
			)}
			<Box sx={{ width: "100%", height }}>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart
						data={formattedData}
						margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke={theme.palette.divider}
						/>
						<XAxis
							dataKey="date"
							tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
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
							tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
							tickFormatter={(value) =>
								`€${value.toLocaleString("de-DE", {
									maximumFractionDigits: 0,
								})}`
							}
							stroke={theme.palette.divider}
							domain={[minValue - padding, maxValue + padding]}
						/>
						<Tooltip
							contentStyle={{
								backgroundColor: theme.palette.background.paper,
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: theme.shape.borderRadius,
							}}
						labelFormatter={(label) => {
							const date = new Date(Number(label));
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
								value !== null && value !== undefined
									? `€${Number(value).toLocaleString("de-DE", { minimumFractionDigits: 2 })}`
									: "No price data"
							}
						/>
						{hasNullValues && (
							<ReferenceLine
								y={0}
								stroke={theme.palette.error.main}
								strokeDasharray="3 3"
							/>
						)}
						<Line
							type="monotone"
							dataKey="value"
							stroke={theme.palette.primary.main}
							strokeWidth={2}
							dot={false}
							activeDot={{ r: 6 }}
							connectNulls={false}
						/>
					</LineChart>
				</ResponsiveContainer>
			</Box>
		</Box>
	);
}
