"use client";

import { Close } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  MenuItem,
  Alert,
} from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { useState } from "react";
import { DateTime } from "luxon";

const CRYPTO_ASSETS = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOT", "AVAX", "MATIC", "LINK", "UNI"];

interface AddStakingDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { timestamp: string; asset: string; quantity: number; eurValue: number }) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
}

export function AddStakingDialog({ open, onClose, onSubmit, isLoading }: AddStakingDialogProps) {
  const [timestamp, setTimestamp] = useState<DateTime | null>(DateTime.now());
  const [asset, setAsset] = useState("");
  const [quantity, setQuantity] = useState("");
  const [eurValue, setEurValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTimestamp(DateTime.now());
    setAsset("");
    setQuantity("");
    setEurValue("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!timestamp || !asset || !quantity || !eurValue) {
      setError("All fields are required");
      return;
    }

    const qty = Number.parseFloat(quantity);
    const eur = Number.parseFloat(eurValue);

    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be a positive number");
      return;
    }

    if (Number.isNaN(eur) || eur <= 0) {
      setError("EUR value must be a positive number");
      return;
    }

    setError(null);
    const result = await onSubmit({
      timestamp: timestamp.toISO()!,
      asset,
      quantity: qty,
      eurValue: eur,
    });
    
    if (result.success) {
      resetForm();
      onClose();
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add Staking Reward
        <IconButton onClick={handleClose} disabled={isLoading} sx={{ position: "absolute", right: 8, top: 8 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <DateTimePicker
            label="Date & Time"
            value={timestamp}
            onChange={(newValue) => setTimestamp(newValue)}
            disabled={isLoading}
            slotProps={{
              textField: {
                fullWidth: true,
                required: true,
              },
            }}
          />

          <TextField
            select
            label="Asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            fullWidth
            required
            disabled={isLoading}
          >
            {CRYPTO_ASSETS.map((a) => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            fullWidth
            required
            disabled={isLoading}
            slotProps={{ htmlInput: { step: "any", min: 0 } }}
            helperText="Amount of tokens received"
          />

          <TextField
            label="Cost Basis (EUR)"
            type="number"
            value={eurValue}
            onChange={(e) => setEurValue(e.target.value)}
            fullWidth
            required
            disabled={isLoading}
            slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
            helperText="EUR value at time of reward"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isLoading || !timestamp || !asset || !quantity || !eurValue}
        >
          {isLoading ? "Adding..." : "Add Reward"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
