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

interface AccountDistribution {
	account: string;
	value: number;
	percentage: number;
	accountId: number;
}

interface AccountDistributionChartProps {
	data: AccountDistribution[];
	height?: number;
	onAccountClick?: (accountId: number) => void;
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

export function AccountDistributionChart({
	data,
	height = 300,
	onAccountClick,
}: AccountDistributionChartProps) {
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
				<Typography color="text.secondary">No account data available</Typography>
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
						nameKey="account"
						cx="50%"
						cy="50%"
						outerRadius={80}
						label={({ name, percent }) =>
							`${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
						}
						labelLine
						onClick={(_, index) => {
							if (onAccountClick && data[index]) {
								onAccountClick(data[index].accountId);
							}
						}}
					>
						{data.map((_entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={COLORS[index % COLORS.length]}
								style={{ cursor: onAccountClick ? "pointer" : "default" }}
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
					<Legend
						formatter={(value, _entry) => {
							const item = data.find(d => d.account === value);
							if (item && onAccountClick) {
								return (
									<span
										style={{ cursor: "pointer", textDecoration: "underline" }}
										onClick={() => onAccountClick(item.accountId)}
									>
										{value}
									</span>
								);
							}
							return value;
						}}
					/>
				</PieChart>
			</ResponsiveContainer>
		</Box>
	);
}
