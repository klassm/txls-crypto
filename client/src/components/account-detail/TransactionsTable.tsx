import { CloudUpload, Sync, Delete, Check } from "@mui/icons-material";
import { Box, Button, Chip, TextField, CircularProgress, Typography, Alert } from "@mui/material";
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
}

export function TransactionsTable({
  transactions,
  onImport,
  csvImportAllowed,
  apiSettings,
  accountId,
  onSyncComplete,
}: TransactionsTableProps) {
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await accountsApi.updateApiSettings(accountId, {
        apiEnabled: true,
        apiKey: apiKey.trim(),
      });
      setApiKey("");
      setSuccess("API key saved");
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  };

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

  const handleDeleteApiKey = async () => {
    if (!confirm("Delete API key? You can re-add it later.")) return;
    
    setIsDeleting(true);
    setError(null);

    try {
      await accountsApi.updateApiSettings(accountId, {
        apiEnabled: false,
      });
      setSuccess("API sync disabled");
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete API key");
    } finally {
      setIsDeleting(false);
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
      header: "Date",
      size: 120,
      Cell: ({ cell }) => {
        const dt = DateTime.fromISO(cell.getValue<string>());
        return dt.isValid ? dt.toLocaleString() : "-";
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

  return (
    <Box>
      <StyledSectionTitle variant="h5">Transactions</StyledSectionTitle>
      <MaterialReactTable
        columns={columns}
        data={transactions}
        enableSorting
        enableFilters
        initialState={{
          sorting: [{ id: "timestamp", desc: true }],
          pagination: { pageSize: 100, pageIndex: 0 },
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
        
        {apiSettings?.supportsApiSync && (
          <>
            {apiSettings.apiEnabled && !apiSettings.hasApiKey ? (
              <Box sx={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
                <TextField
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API Key"
                  size="small"
                  disabled={isSaving}
                  sx={{ width: 200 }}
                />
                <Button
                  variant="outlined"
                  onClick={handleSaveApiKey}
                  disabled={isSaving || !apiKey.trim()}
                  startIcon={isSaving ? <CircularProgress size={20} /> : <Check />}
                >
                  Save
                </Button>
              </Box>
            ) : apiSettings.apiEnabled && apiSettings.hasApiKey ? (
              <Box sx={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
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
                  color="error"
                  onClick={handleDeleteApiKey}
                  disabled={isDeleting}
                  startIcon={isDeleting ? <CircularProgress size={20} /> : <Delete />}
                >
                  Delete Key
                </Button>
                {apiSettings.lastSyncAt && (
                  <Typography variant="caption" color="text.secondary">
                    Last: {new Date(apiSettings.lastSyncAt).toLocaleString()}
                  </Typography>
                )}
              </Box>
            ) : (
              <Button
                variant="outlined"
                onClick={() => {
                  accountsApi.updateApiSettings(accountId, { apiEnabled: true })
                    .then(() => onSyncComplete?.())
                    .catch((err) => setError(err.message));
                }}
              >
                Enable API Sync
              </Button>
            )}
          </>
        )}
      </StyledBox>
    </Box>
  );
}
