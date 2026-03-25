"use client";

import { Box, useTheme } from "@mui/material";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	ReferenceLine,
	Tooltip,
	ResponsiveContainer,
} from "recharts";

interface PositionChartProps {
	data: { date: string; value: number | null }[];
	eurInvested: number;
	height?: number;
}

export function PositionChart({ data, eurInvested, height = 50 }: PositionChartProps) {
	const theme = useTheme();

	const validData = data.filter((d) => d.value !== null);
	if (validData.length === 0) return null;

	const values = validData.map((d) => d.value as number);
	const allValues = [...values, eurInvested];
	const minValue = Math.min(...allValues);
	const maxValue = Math.max(...allValues);
	const padding = (maxValue - minValue) * 0.1 || 10;

	return (
		<Box sx={{ width: "100%", height }}>
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={validData} margin={{ top: 5, right: 5, left: 45, bottom: 20 }}>
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
						width={40}
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
					<ReferenceLine
						y={eurInvested}
						stroke={theme.palette.warning.main}
						strokeDasharray="3 3"
						strokeWidth={1}
					/>
					<Line
						type="monotone"
						dataKey="value"
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
