"use client";

import { Box, Typography, useTheme } from "@mui/material";
import {
	PieChart,
	Pie,
	Cell,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";

interface AssetDistribution {
	asset: string;
	value: number;
	percentage: number;
}

interface AssetDistributionChartProps {
	data: AssetDistribution[];
	height?: number;
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

export function AssetDistributionChart({
	data,
	height = 300,
}: AssetDistributionChartProps) {
	const theme = useTheme();

	if (!data || data.length === 0) {
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
				<Typography color="text.secondary">No asset data available</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ width: "100%", height }}>
			<ResponsiveContainer width="100%" height="100%">
				<PieChart>
					<Pie
						data={data}
						dataKey="value"
						nameKey="asset"
						cx="50%"
						cy="50%"
						outerRadius={80}
						label={({ name, percent }) =>
							`${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
						}
						labelLine
					>
						{data.map((_entry, index) => (
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
					<Legend />
				</PieChart>
			</ResponsiveContainer>
		</Box>
	);
}
