"use client";

import { Close, Key, Delete } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  CircularProgress,
  IconButton,
  TextField,
  Alert,
} from "@mui/material";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface ApiSyncDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving: boolean;
  isDeleting?: boolean;
  error: string | null;
  instructions: string;
  hasExistingKey: boolean;
}

export function ApiSyncDialog({
  open,
  onClose,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  error,
  instructions,
  hasExistingKey,
}: ApiSyncDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setLocalError("Please enter an API key");
      return;
    }
    await onSave(apiKey.trim());
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("Delete API key? This will disable automatic sync. You can add a new key later.")) return;
    await onDelete();
  };

  const handleClose = () => {
    setApiKey("");
    setLocalError(null);
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setLocalError(null);
    }
  }, [open]);

  const isLoading = isSaving || isDeleting;

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { minHeight: 500 } } }}
    >
      <DialogTitle>
        API Sync Setup
        <IconButton
          onClick={handleClose}
          disabled={isLoading}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>{isDeleting ? "Deleting API key..." : "Saving API key..."}</Typography>
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            <Box sx={{ 
              "& h1": { typography: "h6", mb: 2, mt: 2 },
              "& h2": { typography: "subtitle1", mb: 1, mt: 2 },
              "& p": { typography: "body2", mb: 1 },
              "& ol": { pl: 2, mb: 2 },
              "& ul": { pl: 2, mb: 2 },
              "& li": { typography: "body2", mb: 0.5 },
            }}>
              <ReactMarkdown>{instructions}</ReactMarkdown>
            </Box>
            
            {(error || localError) && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError(null)}>
                {error || localError}
              </Alert>
            )}

            {hasExistingKey ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                An API key is already configured. Enter a new key to replace it, or delete the existing key.
              </Alert>
            ) : null}

            <TextField
              type="password"
              label="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKey ? "Enter new API key to replace existing" : "Enter your API key"}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
            />
          </Box>
        )}
      </DialogContent>
      {!isLoading && (
        <DialogActions sx={{ justifyContent: "space-between" }}>
          {hasExistingKey && onDelete ? (
            <Button
              color="error"
              onClick={handleDelete}
              startIcon={<Delete />}
            >
              Delete Key
            </Button>
          ) : (
            <Box />
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!apiKey.trim()}
              startIcon={<Key />}
            >
              {hasExistingKey ? "Replace Key" : "Save Key"}
            </Button>
          </Box>
        </DialogActions>
      )}
    </Dialog>
  );
}
