"use client";

import { Typography, Button, Paper, CircularProgress, Alert } from "@mui/material";
import { Build as BuildIcon } from "@mui/icons-material";
import { useAuth } from "../../../contexts/AuthContext";
import { useRebuildAllHoldings } from "../../../hooks/useAdminMaintenance";
import { PageLayout } from "../../../components/common/PageLayout";

export default function AdminMaintenancePage() {
  const { user } = useAuth();
  const rebuildAllMutation = useRebuildAllHoldings();

  if (!user?.isAdmin) {
    return (
      <PageLayout maxWidth="lg">
        <Typography variant="h6" color="error">
          Access Denied. Admin privileges required.
        </Typography>
      </PageLayout>
    );
  }

  const handleRebuildAll = () => {
    rebuildAllMutation.mutate();
  };

  return (
    <PageLayout maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        Maintenance
      </Typography>

      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Holdings Cache
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Rebuild the asset holdings cache for all users. This recalculates all holdings from transaction history
          and can fix incorrect portfolio values or price changes.
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          This operation may take a few seconds to complete, depending on the amount of transaction data.
        </Alert>
        <Button
          variant="contained"
          color="primary"
          startIcon={rebuildAllMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <BuildIcon />}
          onClick={handleRebuildAll}
          disabled={rebuildAllMutation.isPending}
        >
          {rebuildAllMutation.isPending ? "Rebuilding..." : "Rebuild All Holdings"}
        </Button>
        {rebuildAllMutation.isSuccess && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Successfully rebuilt holdings for {rebuildAllMutation.data.accountsRebuilt} accounts.
          </Alert>
        )}
        {rebuildAllMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Failed to rebuild holdings. Please try again.
          </Alert>
        )}
      </Paper>
    </PageLayout>
  );
}
