"use client";

import { Box, Card, Grid, Typography, Stack } from "@mui/material";
import { usePortfolioOverview } from "../hooks";
import { PageLayout } from "../components/common/PageLayout";
import { PortfolioValueChart } from "../components/charts/PortfolioValueChart";
import { AssetPriceChart } from "../components/charts/AssetPriceChart";
import { AssetDistributionChart } from "../components/charts/AssetDistributionChart";
import type { PortfolioHistoryPoint, AssetOverview } from "../lib/client/prices-api";

interface ChangeStats {
	absolute: number;
	relative: number;
}

function calculateChange(
	history: PortfolioHistoryPoint[] | undefined,
	days: number
): ChangeStats | null {
	if (!history || history.length < 2) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const pastIndex = history.length - 1 - days;
	if (pastIndex < 0) return null;

	const past = history[pastIndex];
	if (past.totalEurValue === null) return null;

	const absolute = latest.totalEurValue - past.totalEurValue;
	const relative = (absolute / past.totalEurValue) * 100;

	return { absolute, relative };
}

function PortfolioStats({ history }: { history: PortfolioHistoryPoint[] | undefined }) {
	if (!history || history.length === 0) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const dayChange = calculateChange(history, 1);
	const weekChange = calculateChange(history, 7);
	const monthChange = calculateChange(history, 30);

	const formatValue = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);

	const formatChange = (change: ChangeStats | null) => {
		if (!change) return { value: "-", color: "text.secondary" };
		const sign = change.absolute >= 0 ? "+" : "";
		const color = change.absolute >= 0 ? "success.main" : "error.main";
		return {
			value: `${sign}${formatValue(change.absolute)} (${sign}${change.relative.toFixed(2)}%)`,
			color,
		};
	};

	const dayFormatted = formatChange(dayChange);
	const weekFormatted = formatChange(weekChange);
	const monthFormatted = formatChange(monthChange);

	return (
		<Grid container spacing={2} sx={{ mb: 4 }}>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<Card sx={{ p: 2 }}>
					<Typography variant="body2" color="text.secondary">
						Total Value
					</Typography>
					<Typography variant="h5" fontWeight={600}>
						{formatValue(latest.totalEurValue)}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<Card sx={{ p: 2 }}>
					<Typography variant="body2" color="text.secondary">
						24h Change
					</Typography>
					<Typography variant="h6" sx={{ color: dayFormatted.color }}>
						{dayFormatted.value}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<Card sx={{ p: 2 }}>
					<Typography variant="body2" color="text.secondary">
						7d Change
					</Typography>
					<Typography variant="h6" sx={{ color: weekFormatted.color }}>
						{weekFormatted.value}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<Card sx={{ p: 2 }}>
					<Typography variant="body2" color="text.secondary">
						30d Change
					</Typography>
					<Typography variant="h6" sx={{ color: monthFormatted.color }}>
						{monthFormatted.value}
					</Typography>
				</Card>
			</Grid>
		</Grid>
	);
}

export default function PortfolioPage() {
	const { data: overview, isLoading } = usePortfolioOverview(30);

	const portfolioHistory = overview?.portfolioHistory;
	const assets = overview?.assets || [];

	return (
		<PageLayout maxWidth="lg">
			<Typography variant="h4" component="h1" sx={{ mb: 4 }}>
				Portfolio
			</Typography>

			{isLoading ? (
				<Typography color="text.secondary">Loading portfolio...</Typography>
			) : !portfolioHistory || portfolioHistory.length === 0 ? (
				<Typography color="text.secondary">
					No assets found. Add an account and import transactions to see your portfolio.
				</Typography>
			) : (
				<>
					<PortfolioStats history={portfolioHistory} />

					{portfolioHistory.length > 0 && (
						<Box sx={{ mb: 4 }}>
							<PortfolioValueChart
								data={portfolioHistory}
								height={250}
								title="Portfolio Value (30 days)"
							/>
						</Box>
					)}

					{portfolioHistory.length > 0 && portfolioHistory[portfolioHistory.length - 1].totalEurValue !== null && (
						<Box sx={{ mb: 4 }}>
							<AssetDistributionChart
								data={Object.entries(portfolioHistory[portfolioHistory.length - 1].assets)
									.map(([asset, data]) => ({
										asset,
										value: data.eurValue || 0,
										percentage: 0,
									}))
									.sort((a, b) => b.value - a.value)}
								height={300}
								title="Asset Distribution"
							/>
						</Box>
					)}

					{assets.length > 0 && (
						<Box sx={{ mb: 4 }}>
							<Typography variant="h6" sx={{ mb: 2 }}>
								Assets
							</Typography>
							<Grid container spacing={2}>
								{assets.map((asset) => (
									<Grid key={asset.asset} size={{ xs: 12, sm: 6, md: 4 }}>
										<AssetCard asset={asset} />
									</Grid>
								))}
							</Grid>
						</Box>
					)}
				</>
			)}
		</PageLayout>
	);
}

function AssetCard({ asset }: { asset: AssetOverview }) {
	const { priceHistory, amount, eurValue } = asset;

	if (!priceHistory || priceHistory.length === 0) {
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

	const currentPrice = priceHistory[priceHistory.length - 1]?.priceEur ?? 0;
	const positionValue = eurValue ?? amount * currentPrice;

	const calculatePriceChange = (days: number): { absolute: number; relative: number } | null => {
		if (priceHistory.length < days + 1) return null;
		const pastPrice = priceHistory[priceHistory.length - 1 - days]?.priceEur;
		if (!pastPrice) return null;
		const absolute = currentPrice - pastPrice;
		const relative = (absolute / pastPrice) * 100;
		return { absolute, relative };
	};

	const dayChange = calculatePriceChange(1);
	const weekChange = calculatePriceChange(7);
	const monthChange = calculatePriceChange(30);

	const formatPrice = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: value < 1 ? 6 : 2,
		}).format(value);

	const formatChange = (change: { absolute: number; relative: number } | null) => {
		if (!change) return { value: "-", color: "text.secondary" };
		const sign = change.absolute >= 0 ? "+" : "";
		const color = change.absolute >= 0 ? "success.main" : "error.main";
		return {
			value: `${sign}${formatPrice(change.absolute)} (${sign}${change.relative.toFixed(2)}%)`,
			color,
		};
	};

	const dayFormatted = formatChange(dayChange);
	const weekFormatted = formatChange(weekChange);
	const monthFormatted = formatChange(monthChange);

	return (
		<Card sx={{ p: 2 }}>
			<Stack spacing={1}>
				<Typography variant="subtitle2" fontWeight={600}>
					{asset.asset}
				</Typography>

				<Box>
					<Typography variant="caption" color="text.secondary">
						Price
					</Typography>
					<Typography variant="body2" fontWeight={500}>
						{formatPrice(currentPrice)}
					</Typography>
				</Box>

				<Box>
					<Typography variant="caption" color="text.secondary">
						Position ({amount.toFixed(4)})
					</Typography>
					<Typography variant="body2" fontWeight={500}>
						{formatPrice(positionValue)}
					</Typography>
				</Box>

				<Grid container spacing={1}>
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

				<Box sx={{ mt: 1 }}>
					<AssetPriceChart data={priceHistory} asset={asset.asset} height={80} />
				</Box>
			</Stack>
		</Card>
	);
}
