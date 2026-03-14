"use client";

import { Box, Card, Grid, Typography, Stack, Divider } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { usePortfolioOverview, useSources } from "../hooks";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "../components/common/PageLayout";
import { PortfolioValueChart } from "../components/charts/PortfolioValueChart";
import { AssetPriceChart } from "../components/charts/AssetPriceChart";
import { AssetDistributionChart } from "../components/charts/AssetDistributionChart";
import { AccountDistributionChart } from "../components/charts/AccountDistributionChart";
import { PositionChart } from "../components/charts/PositionChart";
import { ChartDialog, type TimeSpan } from "../components/charts/ChartDialog";
import { ExpandButton } from "../components/charts/ExpandButton";
import { portfolioApi } from "../lib/client/prices-api";
import type { PortfolioHistoryPoint, AssetOverview, StakingStats } from "../lib/client/prices-api";
import { calculatePortfolioChange } from "@txls/shared";

interface ChangeStats {
	absolute: number;
	relative: number;
}

function calculateChange(
	history: PortfolioHistoryPoint[] | undefined,
	days: number
): ChangeStats | null {
	const result = calculatePortfolioChange(history, days);
	if (!result) return null;
	return result;
}

function PortfolioStats({ history, assets, currentYearStakingRewards, totalStakingRewards }: { history: PortfolioHistoryPoint[] | undefined; assets: AssetOverview[]; currentYearStakingRewards: StakingStats; totalStakingRewards: StakingStats }) {
	if (!history || history.length === 0) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const dayChange = calculateChange(history, 1);
	const weekChange = calculateChange(history, 7);
	const monthChange = calculateChange(history, 30);

	const totalEurInvested = assets.reduce((sum, a) => sum + a.eurInvested, 0);
	const overallProfit = latest.totalEurValue - totalEurInvested;
	const overallProfitPercent = totalEurInvested > 0 ? (overallProfit / totalEurInvested) * 100 : 0;
	const overallColor = overallProfit >= 0 ? "success.main" : "error.main";
	const currentYear = new Date().getFullYear();

	const formatValue = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);

	const formatChange = (change: ChangeStats | null) => {
		if (!change) return { value: "-", percent: "-", color: "text.secondary" };
		const sign = change.absolute >= 0 ? "+" : "";
		const color = change.absolute >= 0 ? "success.main" : "error.main";
		return {
			value: `${sign}${formatValue(change.absolute)}`,
			percent: `${sign}${change.relative.toFixed(2)}%`,
			color,
		};
	};

	const dayFormatted = formatChange(dayChange);
	const weekFormatted = formatChange(weekChange);
	const monthFormatted = formatChange(monthChange);

	const hasStakingRewards = totalStakingRewards.eurValue > 0;

	return (
		<Grid container spacing={2} sx={{ mb: 4 }}>
			<Grid size={{ xs: 12, sm: hasStakingRewards ? 6 : 12 }}>
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
			{hasStakingRewards && (
				<Grid size={{ xs: 12, sm: 6 }}>
					<Card sx={{ p: 2, height: "100%" }}>
						<Typography variant="body2" color="text.secondary">
							Staking Rewards ({currentYear})
						</Typography>
						<Typography variant="h5" fontWeight={600} color="success.main">
							{formatValue(currentYearStakingRewards.eurValue)}
						</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							{currentYearStakingRewards.count} transaction{currentYearStakingRewards.count !== 1 ? 's' : ''}
						</Typography>
						{totalStakingRewards.eurValue !== currentYearStakingRewards.eurValue && (
							<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
								Overall: {formatValue(totalStakingRewards.eurValue)} ({totalStakingRewards.count} total)
							</Typography>
						)}
					</Card>
				</Grid>
			)}
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						Overall
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: overallColor }}>
						{overallProfit >= 0 ? "+" : ""}{formatValue(overallProfit)}
					</Typography>
					<Typography variant="body2" sx={{ color: overallColor }}>
						{overallProfitPercent >= 0 ? "+" : ""}{overallProfitPercent.toFixed(2)}%
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						24h
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: dayFormatted.color }}>
						{dayFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: dayFormatted.color }}>
						{dayFormatted.percent}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						7d
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: weekFormatted.color }}>
						{weekFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: weekFormatted.color }}>
						{weekFormatted.percent}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						30d
					</Typography>
					<Typography variant="h6" fontWeight={600} sx={{ color: monthFormatted.color }}>
						{monthFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: monthFormatted.color }}>
						{monthFormatted.percent}
					</Typography>
				</Card>
			</Grid>
		</Grid>
	);
}

export default function PortfolioPage() {
	const [chartTimeSpan, setChartTimeSpan] = useState<TimeSpan>(30);
	const [dialogOpen, setDialogOpen] = useState(false);
	const daysParam = chartTimeSpan === "all" ? 3650 : chartTimeSpan;
	const { data: overview, isLoading } = usePortfolioOverview(daysParam);
	const { data: sources = [] } = useSources();
	const navigate = useNavigate();

	const portfolioHistory = overview?.portfolioHistory;
	const assets = overview?.assets || [];
	const accounts = overview?.accounts || [];
	const currentYearStakingRewards = overview?.currentYearStakingRewards || { eurValue: 0, count: 0 };
	const totalStakingRewards = overview?.totalStakingRewards || { eurValue: 0, count: 0 };

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
					<PortfolioStats history={portfolioHistory} assets={assets} currentYearStakingRewards={currentYearStakingRewards} totalStakingRewards={totalStakingRewards} />

				{portfolioHistory.length > 0 && (
					<Box sx={{ mb: 4 }}>
						<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
							<ExpandButton onClick={() => setDialogOpen(true)} />
						</Box>
						<PortfolioValueChart
							data={portfolioHistory}
							height={250}
							title="Portfolio Value"
						/>
						<ChartDialog
							open={dialogOpen}
							onClose={() => setDialogOpen(false)}
							title="Portfolio Value"
							initialTimeSpan={chartTimeSpan}
							onTimeSpanChange={setChartTimeSpan}
						>
							<PortfolioValueChart data={portfolioHistory} height={400} title="" />
						</ChartDialog>
					</Box>
				)}

			{portfolioHistory.length > 0 && portfolioHistory[portfolioHistory.length - 1].totalEurValue !== null && (
				<Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: 4 }}>
					<Grid size={{ xs: 12, md: accounts.length > 1 ? 6 : 12 }}>
						<Card sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
							<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
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
					{accounts.length > 1 && (
						<Grid size={{ xs: 12, md: 6 }}>
							<Card sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
								<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
									Account Distribution
								</Typography>
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
							</Card>
						</Grid>
					)}
				</Grid>
			)}

					{assets.length > 0 && (
						<Box sx={{ mb: 4 }}>
							<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
								Assets
							</Typography>
							<Grid container spacing={{ xs: 1.5, sm: 2 }}>
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
	const { priceHistory: initialPriceHistory, amount, eurValue, eurInvested, positionHistory } = asset;
	const [priceDialogOpen, setPriceDialogOpen] = useState(false);
	const [positionDialogOpen, setPositionDialogOpen] = useState(false);
	const [priceTimeSpan, setPriceTimeSpan] = useState<TimeSpan>(30);

	const priceDays = priceTimeSpan === "all" ? 3650 : priceTimeSpan;
	const { data: expandedPriceHistory } = useQuery({
		queryKey: ["asset-price", asset.asset, priceDays],
		queryFn: () => portfolioApi.getAssetPriceHistory(asset.asset, priceDays),
		enabled: priceDialogOpen,
		staleTime: 5 * 60 * 1000,
	});

	if (!initialPriceHistory || initialPriceHistory.length === 0) {
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

	const priceHistory = expandedPriceHistory || initialPriceHistory;

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
		<Card sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
			<Stack spacing={1.5}>
				<Typography variant="subtitle2" fontWeight={600}>
					{asset.asset}
				</Typography>

				<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Box>
						<Typography variant="caption" color="text.secondary">
							Position ({amount.toFixed(4)})
						</Typography>
						<Typography variant="body1" fontWeight={600} sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}>
							{formatPrice(positionValue)}
						</Typography>
					</Box>
					{overallChange && (
						<Box sx={{ textAlign: "right" }}>
							<Typography variant="caption" color="text.secondary">
								Overall
							</Typography>
							<Typography variant="body2" fontWeight={600} sx={{ color: overallChange.color, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
								{overallChange.absolute >= 0 ? "+" : ""}{formatPrice(overallChange.absolute)}
							</Typography>
							<Typography variant="caption" sx={{ color: overallChange.color }}>
								({overallChange.relative >= 0 ? "+" : ""}{overallChange.relative.toFixed(2)}%)
							</Typography>
						</Box>
					)}
				</Box>

				{positionHistory && positionHistory.length > 0 && (
					<Box>
						<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
							<ExpandButton onClick={() => setPositionDialogOpen(true)} />
						</Box>
						<Box sx={{ height: 100 }}>
							<PositionChart data={positionHistory} eurInvested={eurInvested} height={100} />
						</Box>
						<ChartDialog
							open={positionDialogOpen}
							onClose={() => setPositionDialogOpen(false)}
							title={`${asset.asset} Position`}
							initialTimeSpan={30}
							onTimeSpanChange={() => {}}
						>
							<PositionChart data={positionHistory} eurInvested={eurInvested} height={400} />
						</ChartDialog>
					</Box>
				)}

				<Divider />

				<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Typography variant="caption" color="text.secondary">
						Price
					</Typography>
					<ExpandButton onClick={() => setPriceDialogOpen(true)} />
				</Box>

				{priceHistory && priceHistory.length > 0 && (
					<>
						<Box sx={{ height: 80 }}>
							<AssetPriceChart data={priceHistory} height={80} />
						</Box>
						<ChartDialog
							open={priceDialogOpen}
							onClose={() => setPriceDialogOpen(false)}
							title={`${asset.asset} Price`}
							initialTimeSpan={priceTimeSpan}
							onTimeSpanChange={setPriceTimeSpan}
						>
							<AssetPriceChart data={priceHistory} height={400} />
						</ChartDialog>
					</>
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
