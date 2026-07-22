"use client";

import { Box, Card, Grid, Typography, Stack, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { usePortfolioOverview, useSources } from "../hooks";
import { PageLayout } from "../components/common/PageLayout";
import { PortfolioValueChart } from "../components/charts/PortfolioValueChart";
import { AssetDistributionSummary } from "../components/account-detail/AssetDistributionSummary";
import { AccountDistributionChart } from "../components/charts/AccountDistributionChart";
import { ChartDialog, type TimeSpan } from "../components/charts/ChartDialog";
import { ExpandButton } from "../components/charts/ExpandButton";
import { AssetCard } from "../components/assets/AssetCard";
import type { PortfolioHistoryPoint, AssetOverview, StakingStats } from "../lib/client/prices-api";
import { calculatePortfolioChange, calculateOverallChange, type ChangeStats } from "@txls/shared";

function PortfolioStats({ history, assets, currentYearStakingRewards, totalStakingRewards }: { history: PortfolioHistoryPoint[] | undefined; assets: AssetOverview[]; currentYearStakingRewards: StakingStats; totalStakingRewards: StakingStats }) {
	if (!history || history.length === 0) return null;

	const latest = history[history.length - 1];
	if (latest.totalEurValue === null) return null;

	const dayChange = calculatePortfolioChange(history, 1);
	const weekChange = calculatePortfolioChange(history, 7);
	const monthChange = calculatePortfolioChange(history, 30);

	const totalEurInvested = assets.reduce((sum, a) => sum + a.eurInvested, 0);
	const overallChange = calculateOverallChange(latest.totalEurValue, totalEurInvested);
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
	const overallFormatted = formatChange(overallChange);

	const hasStakingRewards = totalStakingRewards.eurValue > 0;

	return (
		<Grid container spacing={2} sx={{ mb: 4 }}>
			<Grid size={{ xs: 12, sm: hasStakingRewards ? 6 : 12 }}>
				<Card sx={{ p: 2, height: "100%" }}>
					<Typography variant="body2" color="text.secondary">
						Total Value
					</Typography>
					<Typography variant="h5" sx={{ fontWeight: 600 }}>
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
						<Typography variant="h5" color="success.main" sx={{ fontWeight: 600 }}>
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
					<Typography variant="h6" sx={{ fontWeight: 600, color: overallFormatted.color }}>
						{overallFormatted.value}
					</Typography>
					<Typography variant="body2" sx={{ color: overallFormatted.color }}>
						{overallFormatted.percent}
					</Typography>
				</Card>
			</Grid>
			<Grid size={{ xs: 6, sm: 3 }}>
				<Card sx={{ p: 2, height: "100%", minHeight: 90 }}>
					<Typography variant="body2" color="text.secondary">
						24h
					</Typography>
					<Typography variant="h6" sx={{ fontWeight: 600, color: dayFormatted.color }}>
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
					<Typography variant="h6" sx={{ fontWeight: 600, color: weekFormatted.color }}>
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
					<Typography variant="h6" sx={{ fontWeight: 600, color: monthFormatted.color }}>
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
	const { data: overview, isLoading, isFetching } = usePortfolioOverview(daysParam);
	const { data: sources = [] } = useSources();
	const navigate = useNavigate();

	const portfolioHistory = overview?.portfolioHistory;
	const assets = overview?.assets || [];
	const accounts = overview?.accounts || [];
	const currentYearStakingRewards = overview?.currentYearStakingRewards || { eurValue: 0, count: 0 };
	const totalStakingRewards = overview?.totalStakingRewards || { eurValue: 0, count: 0 };
	const isChartLoading = isFetching;

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
					<Box sx={{ mb: 4, position: "relative" }}>
						<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
							<ExpandButton onClick={() => setDialogOpen(true)} />
						</Box>
						<PortfolioValueChart
							data={portfolioHistory}
							height={250}
							title="Portfolio Value"
						/>
						{isChartLoading && (
							<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", position: "absolute", inset: 0, zIndex: 1, backgroundColor: "background.paper", opacity: 0.7, borderRadius: 1 }}>
								<CircularProgress size={32} />
							</Box>
						)}
						<ChartDialog
							open={dialogOpen}
							onClose={() => setDialogOpen(false)}
							title="Portfolio Value"
							initialTimeSpan={chartTimeSpan}
							onTimeSpanChange={setChartTimeSpan}
							isLoading={isChartLoading && dialogOpen}
						>
							<PortfolioValueChart data={portfolioHistory} height={400} title="" />
						</ChartDialog>
					</Box>
				)}

			{portfolioHistory.length > 0 && portfolioHistory[portfolioHistory.length - 1].totalEurValue !== null && (
				<Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: 4 }}>
					<Grid size={{ xs: 12, md: accounts.length > 1 ? 6 : 12 }}>
						<AssetDistributionSummary history={portfolioHistory} assets={assets} />
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
								<Stack spacing={{ xs: 1.5, sm: 2 }}>
									{assets.map((asset) => (
										<AssetCard key={asset.asset} asset={asset} />
									))}
								</Stack>
							</Box>
						)}
				</>
			)}
		</PageLayout>
	);
}
