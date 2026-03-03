import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi } from "../lib/client/accounts-api";
import type { CreateAccountDto } from "@txls/shared/client";
import { useSnackbar } from "../contexts/SnackbarContext";

export function useCreateAccount(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: CreateAccountDto) => accountsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      showSuccess("Account created successfully");
      options?.onSuccess?.();
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        navigate("/login");
      }
      showError(err.message || "Failed to create account");
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      showSuccess("Account deleted successfully");
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        navigate("/login");
      }
      showError(err.message || "Failed to delete account");
    },
  });
}

export function useExportTaxCsv(accountId?: number) {
  const { showSuccess, showError } = useSnackbar();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (year: number) => {
      if (!accountId) return Promise.reject(new Error("No account ID"));
      return accountsApi.exportTaxCsv(accountId, year);
    },
    onSuccess: (url: string) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `wiso_tax_export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess("Tax CSV exported successfully");
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        navigate("/login");
      }
      const errorMessage = err.message || "Failed to export tax CSV";
      showError(errorMessage);
    },
  });
}

export function useImportCsv(accountId?: number, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (file: File) => {
      if (!accountId) return Promise.reject(new Error("No account ID"));
      return accountsApi.importCsv(accountId, file);
    },
    onSuccess: (result: { imported: number; skipped?: number; errors?: string[]; validationErrors?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["transactions", accountId] });

      if (result.skipped && result.skipped > 0) {
        showInfo(
          `Import skipped - data matches ${result.skipped} existing records`,
        );
      } else if (result.imported > 0) {
        showSuccess(
          `Successfully imported ${result.imported} transaction${result.imported > 1 ? "s" : ""}`,
        );
      }

      if (result.errors && result.errors.length > 0) {
        showError(
          `${result.errors.length} error(s) occurred during import. Check logs for details.`,
        );
      }

      if (result.validationErrors && result.validationErrors.length > 0) {
        showInfo(
          `${result.validationErrors.length} validation warning(s) - some transactions were skipped`,
        );
      }

      if (result.imported > 0) {
        onSuccess?.();
      }
    },
    onError: (err: any) => {
      if (err.statusCode === 401 || err.statusCode === 403) {
        navigate("/login");
      }
      const errorMessage = err.message || "Failed to import CSV";
      showError(errorMessage);
    },
  });
}
