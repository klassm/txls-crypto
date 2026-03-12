import { CloudUpload, Sync, Key, ArrowDropDown, Add } from "@mui/icons-material";
import { Box, Button, Chip, CircularProgress, Typography, Alert, Menu, MenuItem, ButtonGroup } from "@mui/material";
import { type MRT_ColumnDef, MaterialReactTable } from "material-react-table";
import type { Transaction, ApiSettings } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import { StyledBox, StyledSectionTitle } from "./TransactionsTable.styles";
import { DateTime } from "luxon";
import { useState } from "react";
import { accountsApi } from "../../lib/client/accounts-api";
import { AddStakingDialog } from "./AddStakingDialog";

interface TransactionsTableProps {
  transactions: Transaction[];
  onImport: () => void;
  csvImportAllowed: boolean;
  apiSettings?: ApiSettings;
  accountId: number;
  onSyncComplete?: () => void;
  onConfigureApiKey: () => void;
  supportsManualStaking?: boolean;
}

export function TransactionsTable({
  transactions,
  onImport,
  csvImportAllowed,
  apiSettings,
  accountId,
  onSyncComplete,
  onConfigureApiKey,
  supportsManualStaking = false,
}: TransactionsTableProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncMenuAnchor, setSyncMenuAnchor] = useState<null | HTMLElement>(null);
  const [addStakingOpen, setAddStakingOpen] = useState(false);
  const [isAddingStaking, setIsAddingStaking] = useState(false);

  const handleSync = async (fullSync = false) => {
    setIsSyncing(true);
    setError(null);
    setSyncMenuAnchor(null);

    try {
      const result = await accountsApi.triggerSync(accountId, fullSync);
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

  const handleAddStaking = async (data: { timestamp: string; asset: string; quantity: number; eurValue: number }) => {
    setIsAddingStaking(true);
    try {
      const result = await accountsApi.addManualStaking(accountId, data);
      if (result.success) {
        setSuccess("Staking reward added");
        onSyncComplete?.();
        return { success: true };
      }
      return { success: false, error: "Failed to add staking reward" };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to add staking reward";
      return { success: false, error: errorMsg };
    } finally {
      setIsAddingStaking(false);
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

  const supportsApiSync = apiSettings?.supportsApiSync ?? false;
  const hasApiKey = apiSettings?.hasApiKey ?? false;

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
                <ButtonGroup variant="outlined">
                  <Button
                    onClick={() => handleSync(false)}
                    disabled={isSyncing}
                    startIcon={isSyncing ? <CircularProgress size={20} /> : <Sync />}
                  >
                    Sync
                  </Button>
                  <Button
                    size="small"
                    onClick={(e) => setSyncMenuAnchor(e.currentTarget)}
                    disabled={isSyncing}
                  >
                    <ArrowDropDown />
                  </Button>
                </ButtonGroup>
                <Menu
                  anchorEl={syncMenuAnchor}
                  open={Boolean(syncMenuAnchor)}
                  onClose={() => setSyncMenuAnchor(null)}
                >
                  <MenuItem onClick={() => handleSync(false)}>
                    Incremental Sync
                  </MenuItem>
                  <MenuItem onClick={() => handleSync(true)}>
                    Full Sync (reimport all)
                  </MenuItem>
                </Menu>
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

        {supportsManualStaking && (
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => setAddStakingOpen(true)}
            startIcon={<Add />}
          >
            Add Staking
          </Button>
        )}
      </StyledBox>

      <AddStakingDialog
        open={addStakingOpen}
        onClose={() => setAddStakingOpen(false)}
        onSubmit={handleAddStaking}
        isLoading={isAddingStaking}
      />
    </Box>
  );
}
