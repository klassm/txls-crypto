import { CloudUpload, Sync, Key } from "@mui/icons-material";
import { Box, Button, Chip, CircularProgress, Typography, Alert, FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { type MRT_ColumnDef, MaterialReactTable } from "material-react-table";
import type { Transaction, ApiSettings } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { StyledBox, StyledSectionTitle } from "./TransactionsTable.styles";
import { DateTime } from "luxon";
import { useState } from "react";
import { accountsApi } from "../../lib/client/accounts-api";

interface TransactionsTableProps {
  transactions: Transaction[];
  onImport: () => void;
  csvImportAllowed: boolean;
  apiSettings?: ApiSettings;
  accountId: number;
  onSyncComplete?: () => void;
  onConfigureApiKey: () => void;
  selectedYear?: number;
  onYearChange?: (year: number) => void;
  yearOptions?: number[];
}

export function TransactionsTable({
  transactions,
  onImport,
  csvImportAllowed,
  apiSettings,
  accountId,
  onSyncComplete,
  onConfigureApiKey,
  selectedYear,
  onYearChange,
  yearOptions,
}: TransactionsTableProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);

    try {
      const result = await accountsApi.triggerSync(accountId);
      if (result.success) {
        setSuccess(`Synced ${result.imported} transactions`);
        onSyncComplete?.();
      } else {
        setError(result.error || "Sync failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const getTypeColor = (type: TransactionType) => {
    switch (type) {
      case TransactionType.buy:
        return "success";
      case TransactionType.sell:
        return "error";
      case TransactionType.reward:
        return "info";
      default:
        return "default";
    }
  };

  const columns: MRT_ColumnDef<Transaction>[] = [
    {
      accessorKey: "timestamp",
      header: "Date/Time",
      size: 150,
      Cell: ({ cell }) => {
        const dt = DateTime.fromISO(cell.getValue<string>());
        return dt.isValid ? dt.toLocaleString(DateTime.DATETIME_SHORT) : "-";
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      size: 80,
      Cell: ({ cell }) => {
        const type = cell.getValue<string>() as TransactionType;
        return (
          <Chip
            label={type.toUpperCase()}
            color={getTypeColor(type) as any}
            size="small"
          />
        );
      },
    },
    {
      accessorKey: "asset",
      header: "Asset",
      size: 80,
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      size: 120,
      Cell: ({ cell }) => Number(cell.getValue<number>()).toFixed(8),
    },
    {
      accessorKey: "eurValue",
      header: "EUR Value",
      size: 120,
      Cell: ({ cell }) => `€${Number(cell.getValue<number>()).toFixed(2)}`,
    },
    {
      accessorKey: "eurFee",
      header: "EUR Fee",
      size: 100,
      Cell: ({ cell }) => `€${Number(cell.getValue<number>()).toFixed(2)}`,
    },
    {
      accessorKey: "externalId",
      header: "External ID",
      size: 200,
    },
  ];

  const supportsApiSync = apiSettings?.supportsApiSync ?? false;
  const hasApiKey = apiSettings?.hasApiKey ?? false;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <StyledSectionTitle variant="h5">Transactions</StyledSectionTitle>
        {selectedYear !== undefined && onYearChange && yearOptions && (
          <FormControl sx={{ minWidth: 120 }} size="small">
            <InputLabel shrink>Year</InputLabel>
            <Select
              value={selectedYear}
              label="Year"
              onChange={(e) => onYearChange(Number(e.target.value))}
              notched
            >
              {yearOptions.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>
      <MaterialReactTable
        columns={columns}
        data={transactions}
        enableSorting
        enableFilters
        initialState={{
          sorting: [{ id: "timestamp", desc: true }],
          pagination: { pageSize: 100, pageIndex: 0 },
          columnVisibility: { externalId: false },
        }}
        muiTablePaperProps={{
          elevation: 0,
          sx: { boxShadow: "none" },
        }}
        muiTableContainerProps={{
          sx: { maxHeight: "calc(100vh - 200px)" },
        }}
      />
      <StyledBox>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}
        
        {csvImportAllowed && (
          <Button
            variant="contained"
            color="primary"
            onClick={onImport}
            startIcon={<CloudUpload />}
            sx={{ mr: 1 }}
          >
            Import CSV
          </Button>
        )}
        
        {supportsApiSync && (
          <Box sx={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
            {hasApiKey ? (
              <>
                <Button
                  variant="outlined"
                  onClick={handleSync}
                  disabled={isSyncing}
                  startIcon={isSyncing ? <CircularProgress size={20} /> : <Sync />}
                >
                  Sync
                </Button>
                <Button
                  variant="outlined"
                  onClick={onConfigureApiKey}
                  startIcon={<Key />}
                >
                  Settings
                </Button>
                {apiSettings?.lastSyncAt && (
                  <Typography variant="caption" color="text.secondary">
                    Last: {new Date(apiSettings.lastSyncAt).toLocaleString()}
                  </Typography>
                )}
              </>
            ) : (
              <Button
                variant="outlined"
                onClick={onConfigureApiKey}
                startIcon={<Key />}
              >
                Configure API Sync
              </Button>
            )}
          </Box>
        )}
      </StyledBox>
    </Box>
  );
}
