"use client";

import { Box, Typography, Alert } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ProviderType } from "../../../lib/types";
import { PageHeader } from "../../components/common/PageHeader";
import { AccountStatsCards } from "../../components/account-detail/AccountStatsCards";
import { AssetSummary } from "../../components/account-detail/AssetSummary";
import { EmptyState } from "../../components/account-detail/EmptyState";
import { ImportCsvDialog } from "../../components/account-detail/ImportCsvDialog";
import { TransactionsTable } from "../../components/account-detail/TransactionsTable";
import { useSnackbar } from "../../contexts/SnackbarContext";
import { useAccount } from "../../hooks";
import { useImportCsv } from "../../hooks/useAccountMutations";
import { useAccountTransactions } from "../../hooks";
import { useAuth } from "../../contexts/AuthContext";
import { PageLayout } from "../../components/common/PageLayout";

export default function AccountDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: account, isLoading: isAccountLoading } = useAccount(Number(id));

  const queryYear = searchParams.get("year");
  const currentYear = new Date().getFullYear();
  const selectedYear = queryYear ? Number.parseInt(queryYear, 10) : currentYear;

  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleYearChange = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", year.toString());
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const { data: transactionsData, isLoading: isTransactionsLoading } = useAccountTransactions(Number(id), selectedYear);

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

  return (
    <PageLayout>
      {isAccountLoading ? (
        <Typography variant="body1" sx={{ textAlign: "center", mt: 4 }}>
          Loading account...
        </Typography>
      ) : (
        <>
          <PageHeader
            title={account?.name ?? ProviderType.TradeRepublic}
            onBack={() => router.push("/")}
            selectedYear={selectedYear}
            onYearChange={handleYearChange}
            yearOptions={yearOptions}
          />
          <Box>
            <AccountStatsCards
              staking={stats.staking}
              buys={stats.buys}
              sells={stats.sells}
              year={selectedYear}
            />

            {isTransactionsLoading ? (
              <Typography sx={{ textAlign: "center", py: 8 }}>
                Loading transactions...
              </Typography>
            ) : transactions.length === 0 ? (
              <EmptyState
                onImport={() => setImportDialogOpen(true)}
                csvImportAllowed={account?.csvImportAllowed || false}
              />
            ) : (
              <Box>
                <AssetSummary
                  stats={stats?.assetStats ?? []}
                  year={selectedYear}
                />
                <TransactionsTable
                  transactions={transactions}
                  onImport={() => setImportDialogOpen(true)}
                  csvImportAllowed={account?.csvImportAllowed || false}
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