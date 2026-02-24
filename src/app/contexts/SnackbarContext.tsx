"use client";

import type { SnackbarOrigin } from "@mui/material";
import { Snackbar, Alert } from "@mui/material";
import { type ReactNode, createContext, useContext, useState } from "react";

interface SnackbarState {
  open: boolean;
  message: string;
  severity: "success" | "error" | "warning" | "info";
}

interface SnackbarContextValue {
  snackbar: SnackbarState;
  showSuccess: (message: string, options?: Partial<SnackbarOrigin>) => void;
  showError: (message: string, options?: Partial<SnackbarOrigin>) => void;
  showWarning: (message: string, options?: Partial<SnackbarOrigin>) => void;
  showInfo: (message: string, options?: Partial<SnackbarOrigin>) => void;
  close: () => void;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(
  undefined,
);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: "",
    severity: "info",
  });

  const showSnackbar = (
    severity: SnackbarState["severity"],
    message: string,
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  const close = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const value: SnackbarContextValue = {
    snackbar,
    showSuccess: (message) => showSnackbar("success", message),
    showError: (message) => showSnackbar("error", message),
    showWarning: (message) => showSnackbar("warning", message),
    showInfo: (message) => showSnackbar("info", message),
    close,
  };

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={close}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (context === undefined) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
}
