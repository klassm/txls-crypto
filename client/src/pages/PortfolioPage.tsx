"use client";

import { Box, Card, Grid, Typography, Stack, Divider } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { usePortfolioOverview, useSources } from "../hooks";
import { PageLayout } from "../components/common/PageLayout";
import { PortfolioValueChart } from "../components/charts/PortfolioValueChart";
import { AssetPriceChart } from "../components/charts/AssetPriceChart";
import { AssetDistributionChart } from "../components/charts/AssetDistributionChart";
import { AccountDistributionChart } from "../components/charts/AccountDistributionChart";
import { PositionChart } from "../components/charts/PositionChart";
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

function PortfolioStats({ history, assets }: { history: PortfolioHistoryPoint[] | undefined; assets: AssetOverview[] }) {
	if (!history || history.length === 0) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const dayChange = calculateChange(history, 1);
	const weekChange = calculateChange(history, 7);

	const totalEurInvested = assets.reduce((sum, a) => sum + a.eurInvested, 0);
	const overallProfit = latest.totalEurValue - totalEurInvested;
	const overallProfitPercent = totalEurInvested > 0 ? (overallProfit / totalEurInvested) * 100 : 0;
	const overallColor = overallProfit >= 0 ? "success.main" : "error.main";

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

	return (
		<Grid container spacing={2} sx={{ mb: 4 }}>
			<Grid size={{ xs: 12, sm: 6, md: 4 }}>
				<Card sx={{ p: 2, height: "100%" }}>
					<Typography variant="body2" color="text.secondary">
						Total Value
					</Typography>
					<Typography variant="h5" fontWeight={600}>
						{formatValue(latest.totalEurValue)}
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
						Invested: {formatValue(totalEurInvested)}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 4 }}>
				<Card sx={{ p: 2, height: "100%" }}>
					<Typography variant="body2" color="text.secondary">
						Overall Profit
					</Typography>
					<Typography variant="h5" sx={{ color: overallColor }}>
						{overallProfit >= 0 ? "+" : ""}{formatValue(overallProfit)}
					</Typography>
					<Typography variant="body2" sx={{ color: overallColor }}>
						{overallProfitPercent >= 0 ? "+" : ""}{overallProfitPercent.toFixed(2)}%
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 4 }}>
				<Card sx={{ p: 2, height: "100%" }}>
					<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
						<Box sx={{ flex: 1 }}>
							<Typography variant="body2" color="text.secondary">
								24h Change
							</Typography>
							<Typography variant="h6" sx={{ color: dayFormatted.color }}>
								{dayFormatted.value}
							</Typography>
						</Box>
						<Box sx={{ flex: 1, textAlign: "right" }}>
							<Typography variant="body2" color="text.secondary">
								7d Change
							</Typography>
							<Typography variant="h6" sx={{ color: weekFormatted.color }}>
								{weekFormatted.value}
							</Typography>
						</Box>
					</Box>
				</Card>
			</Grid>
		</Grid>
	);
}

export default function PortfolioPage() {
	const { data: overview, isLoading } = usePortfolioOverview(30);
	const { data: sources = [] } = useSources();
	const navigate = useNavigate();

	const portfolioHistory = overview?.portfolioHistory;
	const assets = overview?.assets || [];
	const accounts = overview?.accounts || [];

	const getProviderName = (provider: string) => {
		const source = sources.find(s => s.source === provider);
		return source?.name ?? provider;
	};

	const handleAccountClick = (accountId: number) => {
		navigate(`/accounts/${accountId}`);
	};

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
					<PortfolioStats history={portfolioHistory} assets={assets} />

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
					<Grid container spacing={2} sx={{ mb: 4 }}>
						<Grid size={{ xs: 12, md: 6 }}>
							<Card sx={{ p: 2, height: "100%" }}>
								<Typography variant="h6" sx={{ mb: 2 }}>
									Asset Distribution
								</Typography>
								<AssetDistributionChart
									data={Object.entries(portfolioHistory[portfolioHistory.length - 1].assets)
										.map(([asset, data]) => ({
											asset,
											value: data.eurValue || 0,
											percentage: 0,
										}))
										.sort((a, b) => b.value - a.value)}
									height={300}
								/>
							</Card>
						</Grid>
						<Grid size={{ xs: 12, md: 6 }}>
							<Card sx={{ p: 2, height: "100%" }}>
								<Typography variant="h6" sx={{ mb: 2 }}>
									Account Distribution
								</Typography>
								{accounts.length > 1 ? (
							<AccountDistributionChart
								data={accounts
									.filter(a => a.eurValue !== null)
									.map(a => ({
										account: getProviderName(a.provider),
										value: a.eurValue || 0,
										percentage: 0,
										accountId: a.accountId,
									}))
									.sort((a, b) => b.value - a.value)}
								height={300}
								onAccountClick={handleAccountClick}
							/>
								) : (
									<Box sx={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
										<Typography color="text.secondary">
											Only one account
										</Typography>
									</Box>
								)}
							</Card>
						</Grid>
					</Grid>
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
	const { priceHistory, amount, eurValue, eurInvested, positionHistory } = asset;

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

	const calculateOverallChange = (): { absolute: number; relative: number; color: string } | null => {
		if (eurInvested <= 0 || positionValue === null) return null;
		const absolute = positionValue - eurInvested;
		const relative = (absolute / eurInvested) * 100;
		const color = absolute >= 0 ? "success.main" : "error.main";
		return { absolute, relative, color };
	};

	const dayChange = calculatePriceChange(1);
	const weekChange = calculatePriceChange(7);
	const monthChange = calculatePriceChange(30);
	const overallChange = calculateOverallChange();

	const formatPrice = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
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
		<Card sx={{ p: 2, height: "100%" }}>
			<Stack spacing={1.5}>
				<Typography variant="subtitle2" fontWeight={600}>
					{asset.asset}
				</Typography>

				<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Box>
						<Typography variant="caption" color="text.secondary">
							Position ({amount.toFixed(4)})
						</Typography>
						<Typography variant="body1" fontWeight={600}>
							{formatPrice(positionValue)}
						</Typography>
					</Box>
					{overallChange && (
						<Box sx={{ textAlign: "right" }}>
							<Typography variant="caption" color="text.secondary">
								Overall
							</Typography>
							<Typography variant="body1" fontWeight={600} sx={{ color: overallChange.color }}>
								{overallChange.absolute >= 0 ? "+" : ""}{formatPrice(overallChange.absolute)}
							</Typography>
							<Typography variant="caption" sx={{ color: overallChange.color }}>
								({overallChange.relative >= 0 ? "+" : ""}{overallChange.relative.toFixed(2)}%)
							</Typography>
						</Box>
					)}
				</Box>

				{positionHistory && positionHistory.length > 0 && (
					<Box sx={{ height: 100 }}>
						<PositionChart data={positionHistory} eurInvested={eurInvested} height={100} />
					</Box>
				)}

				<Divider />

				<Box>
					<Typography variant="caption" color="text.secondary">
						Price
					</Typography>
				</Box>

				{priceHistory && priceHistory.length > 0 && (
					<Box sx={{ height: 80 }}>
						<AssetPriceChart data={priceHistory} height={80} />
					</Box>
				)}

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
			</Stack>
		</Card>
	);
}
