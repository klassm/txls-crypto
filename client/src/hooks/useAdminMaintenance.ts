import { useMutation } from "@tanstack/react-query";
import { adminMaintenanceApi } from "../lib/client/admin-maintenance-api";
import { useSnackbar } from "../contexts/SnackbarContext";

export function useRebuildAllHoldings() {
  const { showSuccess, showError } = useSnackbar();

  return useMutation({
    mutationFn: () => adminMaintenanceApi.rebuildAllHoldings(),
    onSuccess: (data) => {
      showSuccess(`Rebuilt holdings for ${data.accountsRebuilt} accounts`);
    },
    onError: (err: any) => {
      showError(err.error || err.message || "Failed to rebuild holdings");
    },
  });
}

export function useRebuildUserHoldings() {
  const { showSuccess, showError } = useSnackbar();

  return useMutation({
    mutationFn: (userId: number) => adminMaintenanceApi.rebuildUserHoldings(userId),
    onSuccess: (data) => {
      showSuccess(`Rebuilt holdings for ${data.accountsRebuilt} accounts`);
    },
    onError: (err: any) => {
      showError(err.error || err.message || "Failed to rebuild holdings");
    },
  });
}
