"use client";

import { Box, Typography, Grid, Card } from "@mui/material";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { PageHeader } from "../../components/common/PageHeader";
import { EmptyState } from "../../components/account-detail/EmptyState";
import { ImportCsvDialog } from "../../components/account-detail/ImportCsvDialog";
import { ApiSyncDialog } from "../../components/account-detail/ApiSyncDialog";
import { TransactionsTable } from "../../components/account-detail/TransactionsTable";
import { PortfolioValueChart } from "../../components/charts/PortfolioValueChart";
import { AccountStats } from "../../components/account-detail/AccountStats";
import { AssetDistributionSummary } from "../../components/account-detail/AssetDistributionSummary";
import { ChartDialog, type TimeSpan } from "../../components/charts/ChartDialog";
import { ExpandButton } from "../../components/charts/ExpandButton";
import { useAccount, usePortfolioHistory, useSources, useApiSettings } from "../../hooks";
import { useImportCsv } from "../../hooks/useAccountMutations";
import { useAccountTransactions } from "../../hooks";
import { PageLayout } from "../../components/common/PageLayout";
import { accountsApi } from "../../lib/client/accounts-api";

export default function AccountDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const { data: account, isLoading: isAccountLoading } = useAccount(Number(id));
	const { data: sources = [] } = useSources();
	const { data: apiSettings, refetch: refetchApiSettings } = useApiSettings(Number(id));

	const queryYear = searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const selectedYear = queryYear ? Number.parseInt(queryYear, 10) : currentYear;

	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [apiSyncDialogOpen, setApiSyncDialogOpen] = useState(false);
	const [apiSyncError, setApiSyncError] = useState<string | null>(null);
	const [isSavingApiKey, setIsSavingApiKey] = useState(false);
	const [isDeletingApiKey, setIsDeletingApiKey] = useState(false);
	const [chartTimeSpan, setChartTimeSpan] = useState<TimeSpan>(30);
	const [chartDialogOpen, setChartDialogOpen] = useState(false);

	const handleYearChange = (year: number) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("year", year.toString());
		navigate(`?${params.toString()}`, { replace: true });
	};

	const { data: transactionsData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useAccountTransactions(Number(id), selectedYear);

	const chartDays = chartTimeSpan === "all" ? 3650 : chartTimeSpan;
	const { data: portfolioHistory } = usePortfolioHistory(Number(id), chartDays);

	const importMutation = useImportCsv(Number(id), () => {
		setTimeout(() => {
			location.reload();
		}, 500);
	});

	const handleImport = async (file: File) => {
		importMutation.mutate(file);
	};

	const handleSyncComplete = () => {
		refetchApiSettings();
		refetchTransactions();
	};

	const handleSaveApiKey = async (apiKey: string) => {
		setIsSavingApiKey(true);
		setApiSyncError(null);
		try {
			await accountsApi.updateApiSettings(Number(id), {
				apiEnabled: true,
				apiKey,
			});
			setApiSyncDialogOpen(false);
			handleSyncComplete();
		} catch (err) {
			setApiSyncError(err instanceof Error ? err.message : "Failed to save API key");
		} finally {
			setIsSavingApiKey(false);
		}
	};

	const handleDeleteApiKey = async () => {
		setIsDeletingApiKey(true);
		setApiSyncError(null);
		try {
			await accountsApi.updateApiSettings(Number(id), {
				apiEnabled: false,
			});
			setApiSyncDialogOpen(false);
			handleSyncComplete();
		} catch (err) {
			setApiSyncError(err instanceof Error ? err.message : "Failed to delete API key");
		} finally {
			setIsDeletingApiKey(false);
		}
	};

	const transactions = transactionsData?.transactions || [];
	const yearOptions = transactionsData?.availableYears ?? [currentYear];

	const isApiSyncEnabled = apiSettings?.apiEnabled ?? false;
	const hasApiKey = apiSettings?.hasApiKey ?? false;
	const csvImportAllowed = !isApiSyncEnabled && (account?.csvImportAllowed || false);

	const currentSource = sources.find((s) => s.source === account?.provider);
	const apiSyncInstructions = currentSource?.apiSyncMarkdownInstructions ?? "";

	const formatValue = (value: number) =>
		new Intl.NumberFormat("de-DE", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);

	const latestPortfolioValue = portfolioHistory && portfolioHistory.length > 0
		? portfolioHistory[portfolioHistory.length - 1].totalEurValue
		: null;

	return (
		<PageLayout>
			{isAccountLoading ? (
				<Typography variant="body1" sx={{ textAlign: "center", mt: 4 }}>
					Loading account...
				</Typography>
			) : (
				<>
					<PageHeader
						title={currentSource?.name ?? "Account"}
						selectedYear={selectedYear}
						onYearChange={handleYearChange}
						yearOptions={yearOptions}
					/>
					<Box>
						{portfolioHistory && portfolioHistory.length > 0 && (
							<Box sx={{ mb: 3 }}>
								<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
									<ExpandButton onClick={() => setChartDialogOpen(true)} />
								</Box>
								<PortfolioValueChart
									data={portfolioHistory}
									height={250}
									title="Portfolio Value"
								/>
								<ChartDialog
									open={chartDialogOpen}
									onClose={() => setChartDialogOpen(false)}
									title="Portfolio Value"
									initialTimeSpan={chartTimeSpan}
									onTimeSpanChange={setChartTimeSpan}
								>
									<PortfolioValueChart data={portfolioHistory} height={400} title="" />
								</ChartDialog>
							</Box>
						)}

						{isTransactionsLoading ? (
							<Typography sx={{ textAlign: "center", py: 8 }}>
								Loading transactions...
							</Typography>
						) : transactions.length === 0 ? (
							<EmptyState
								onImport={() => setImportDialogOpen(true)}
								csvImportAllowed={csvImportAllowed}
								apiSettings={apiSettings}
								accountId={Number(id)}
								onSyncComplete={handleSyncComplete}
								onConfigureApiKey={() => setApiSyncDialogOpen(true)}
							/>
						) : (
							<Grid container spacing={3}>
								<Grid size={{ xs: 12, lg: 8 }}>
									<TransactionsTable
										transactions={transactions}
										onImport={() => setImportDialogOpen(true)}
										csvImportAllowed={csvImportAllowed}
										apiSettings={apiSettings}
										accountId={Number(id)}
										onSyncComplete={handleSyncComplete}
										onConfigureApiKey={() => setApiSyncDialogOpen(true)}
									/>
								</Grid>
								<Grid size={{ xs: 12, lg: 4 }}>
									<Box sx={{ position: { lg: "sticky" }, top: { lg: 16 } }}>
										{latestPortfolioValue !== null && (
											<Card sx={{ p: 2, mb: 2 }}>
												<Typography variant="body2" color="text.secondary">
													Total Value
												</Typography>
												<Typography variant="h4" fontWeight={600}>
													{formatValue(latestPortfolioValue)}
												</Typography>
											</Card>
										)}

										<Box sx={{ mb: 2 }}>
											<AccountStats history={portfolioHistory} />
										</Box>

										<AssetDistributionSummary history={portfolioHistory} />
									</Box>
								</Grid>
							</Grid>
						)}
					</Box>
					<ImportCsvDialog
						open={importDialogOpen}
						onClose={() => setImportDialogOpen(false)}
						onImport={handleImport}
						isImporting={importMutation.isPending}
					/>
					<ApiSyncDialog
						open={apiSyncDialogOpen}
						onClose={() => {
							setApiSyncDialogOpen(false);
							setApiSyncError(null);
						}}
						onSave={handleSaveApiKey}
						onDelete={handleDeleteApiKey}
						isSaving={isSavingApiKey}
						isDeleting={isDeletingApiKey}
						error={apiSyncError}
						instructions={apiSyncInstructions}
						hasExistingKey={hasApiKey}
					/>
				</>
			)}
		</PageLayout>
	);
}
