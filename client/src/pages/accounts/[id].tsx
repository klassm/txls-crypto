"use client";

import { Box, Typography } from "@mui/material";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { PageHeader } from "../../components/common/PageHeader";
import { AccountStatsCards } from "../../components/account-detail/AccountStatsCards";
import { AssetSummary } from "../../components/account-detail/AssetSummary";
import { EmptyState } from "../../components/account-detail/EmptyState";
import { ImportCsvDialog } from "../../components/account-detail/ImportCsvDialog";
import { ApiSyncSettings } from "../../components/account-detail/ApiSyncSettings";
import { TransactionsTable } from "../../components/account-detail/TransactionsTable";
import { PortfolioValueChart } from "../../components/charts/PortfolioValueChart";
import { useAccount, usePortfolioHistory, useSources, useApiSettings } from "../../hooks";
import { useImportCsv } from "../../hooks/useAccountMutations";
import { useAccountTransactions } from "../../hooks";
import { PageLayout } from "../../components/common/PageLayout";

export default function AccountDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const { data: account, isLoading: isAccountLoading } = useAccount(Number(id));
	const { data: sources = [] } = useSources();
	const { data: apiSettings } = useApiSettings(Number(id));

	const queryYear = searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const selectedYear = queryYear ? Number.parseInt(queryYear, 10) : currentYear;

	const [importDialogOpen, setImportDialogOpen] = useState(false);

	const handleYearChange = (year: number) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("year", year.toString());
		navigate(`?${params.toString()}`, { replace: true });
	};

	const { data: transactionsData, isLoading: isTransactionsLoading } = useAccountTransactions(Number(id), selectedYear);

	const { data: portfolioHistory } = usePortfolioHistory(Number(id), 90);

	const importMutation = useImportCsv(Number(id), () => {
		setTimeout(() => {
			location.reload();
		}, 500);
	});

	const handleImport = async (file: File) => {
		importMutation.mutate(file);
	};

	const transactions = transactionsData?.transactions || [];
	const stats = transactionsData?.stats ?? {
		year: currentYear,
		staking: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
		buys: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
		sells: { cryptoAmount: 0, fiatAmount: 0, count: 0 },
		assetStats: [],
	};
	const yearOptions = transactionsData?.availableYears ?? [currentYear];

	const isApiSyncEnabled = apiSettings?.apiEnabled ?? false;
	const csvImportAllowed = !isApiSyncEnabled && (account?.csvImportAllowed || false);

	return (
		<PageLayout>
			{isAccountLoading ? (
				<Typography variant="body1" sx={{ textAlign: "center", mt: 4 }}>
					Loading account...
				</Typography>
			) : (
				<>
					<PageHeader
						title={sources.find((s) => s.source === account?.provider)?.name ?? "Account"}
						selectedYear={selectedYear}
						onYearChange={handleYearChange}
						yearOptions={yearOptions}
					/>
					<Box>
						<ApiSyncSettings 
							accountId={Number(id)} 
							onSettingsChange={() => location.reload()}
						/>

						{portfolioHistory && portfolioHistory.length > 0 && (
							<Box sx={{ mb: 3 }}>
								<PortfolioValueChart
									data={portfolioHistory}
									height={250}
									title="Portfolio Value (90 days)"
								/>
							</Box>
						)}

						<AccountStatsCards
							staking={stats.staking}
							buys={stats.buys}
							sells={stats.sells}
						/>

						{isTransactionsLoading ? (
							<Typography sx={{ textAlign: "center", py: 8 }}>
								Loading transactions...
							</Typography>
						) : transactions.length === 0 ? (
							<EmptyState
								onImport={() => setImportDialogOpen(true)}
								csvImportAllowed={csvImportAllowed}
							/>
						) : (
							<Box>
								<AssetSummary
									stats={stats?.assetStats ?? []}
								/>
								<TransactionsTable
									transactions={transactions}
									onImport={() => setImportDialogOpen(true)}
									csvImportAllowed={csvImportAllowed}
								/>
							</Box>
						)}
					</Box>
					<ImportCsvDialog
						open={importDialogOpen}
						onClose={() => setImportDialogOpen(false)}
						onImport={handleImport}
						isImporting={importMutation.isPending}
					/>
				</>
			)}
		</PageLayout>
	);
}
