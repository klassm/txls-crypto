"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Divider,
} from "@mui/material";
import { Sync as SyncIcon, Check as CheckIcon, Error as ErrorIcon } from "@mui/icons-material";
import { accountsApi } from "../../lib/client/accounts-api";
import { useSyncWebSocket } from "../../hooks/useSyncWebSocket";
import type { ApiSettings } from "@txls/shared";

interface ApiSyncSettingsProps {
  accountId: number;
  onSettingsChange?: (apiEnabled: boolean) => void;
}

export function ApiSyncSettings({ accountId, onSettingsChange }: ApiSyncSettingsProps) {
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { status: wsStatus, error: wsError } = useSyncWebSocket(accountId);

  useEffect(() => {
    loadSettings();
  }, [accountId]);

  useEffect(() => {
    if (wsStatus === "syncing") {
      setIsSyncing(true);
    } else {
      setIsSyncing(false);
      if (wsStatus === "idle" && settings?.apiEnabled) {
        loadSettings();
      }
    }
    if (wsError) {
      setError(wsError);
    }
  }, [wsStatus, wsError, settings?.apiEnabled]);

  const loadSettings = async () => {
    try {
      const data = await accountsApi.getApiSettings(accountId);
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    
    if (!enabled && settings?.hasApiKey) {
      if (!confirm("Disabling API sync will allow CSV import again. Continue?")) {
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await accountsApi.updateApiSettings(accountId, {
        apiEnabled: enabled,
        apiKey: enabled && !settings?.hasApiKey ? apiKey : undefined,
      });
      setSettings(updated);
      setApiKey("");
      onSettingsChange?.(enabled);
      setSuccess(enabled ? "API sync enabled" : "API sync disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await accountsApi.updateApiSettings(accountId, {
        apiEnabled: true,
        apiKey: apiKey.trim(),
      });
      setSettings(updated);
      setApiKey("");
      setSuccess("API key saved successfully");
      onSettingsChange?.(true);
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
        setSuccess(`Sync completed: ${result.imported} transactions imported`);
      } else {
        setError(result.error || "Sync failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger sync");
    }
  };

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  if (!settings?.supportsApiSync) {
    return null;
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        API Sync
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Automatically import transactions from Bitpanda using API token.
        When enabled, CSV import is disabled.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <FormControlLabel
        control={
          <Switch
            checked={settings.apiEnabled}
            onChange={handleToggle}
            disabled={isSaving || isSyncing}
          />
        }
        label="Enable API Sync"
        sx={{ mb: 2 }}
      />

      {settings.apiEnabled && (
        <>
          <Divider sx={{ my: 2 }} />

          {!settings.hasApiKey ? (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Enter your Bitpanda API key:
              </Typography>
              <TextField
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                fullWidth
                size="small"
                disabled={isSaving}
                sx={{ mb: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleSaveApiKey}
                disabled={isSaving || !apiKey.trim()}
                startIcon={isSaving ? <CircularProgress size={20} /> : <CheckIcon />}
              >
                Test & Save
              </Button>
            </Box>
          ) : (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                API key configured
              </Typography>
              <Button
                variant="outlined"
                onClick={handleSync}
                disabled={isSyncing}
                startIcon={isSyncing ? <CircularProgress size={20} /> : <SyncIcon />}
              >
                Sync Now
              </Button>
            </Box>
          )}

          {settings.lastSyncAt && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Last sync: {settings.lastSyncAt}
            </Typography>
          )}

          {settings.syncError && (
            <Alert severity="error" sx={{ mt: 2 }} icon={<ErrorIcon />}>
              {settings.syncError}
            </Alert>
          )}
        </>
      )}
    </Paper>
  );
}
