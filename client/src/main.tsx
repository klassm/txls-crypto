import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterLuxon } from "@mui/x-date-pickers/AdapterLuxon";
import App from "./App";
import { getBasePath } from "./lib/api-base";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  queryCache: undefined,
});

function handleAuthError(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const apiError = error as { statusCode: number };
    if (apiError.statusCode === 401 || apiError.statusCode === 403) {
      const basePath = getBasePath();
      window.location.href = `${basePath}/login`;
    }
  }
}

queryClient.getQueryCache().config.onError = handleAuthError;
queryClient.getMutationCache().config.onError = handleAuthError;

const theme = createTheme({
  palette: {
    mode: "light",
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterLuxon}>
          <CssBaseline />
          <BrowserRouter basename={getBasePath()}>
            <App />
          </BrowserRouter>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
