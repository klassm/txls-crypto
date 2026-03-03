"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
} from "@mui/material";
import { User } from "@txls/shared/client";
import { useState } from "react";
import { useResetUserPassword } from "../../hooks/useAdminUsers";

interface ResetPasswordDialogProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ResetPasswordDialog({
  open,
  user,
  onClose,
  onSuccess,
}: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const resetMutation = useResetUserPassword();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!user) return;

    if (password.length < 15) {
      setError("Password must be at least 15 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    resetMutation.mutate(
      {
        id: user.id,
        password,
      },
      {
        onSuccess: () => {
          setPassword("");
          setConfirmPassword("");
          onSuccess();
        },
      }
    );
  };

  const handleClose = () => {
    setPassword("");
    setConfirmPassword("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          {user && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Resetting password for <strong>{user.name}</strong> (
              {user.username})
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              helperText="At least 15 characters, one uppercase, one lowercase, one number, one special character"
            />
            <TextField
              fullWidth
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              margin="normal"
              required
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={resetMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={resetMutation.isPending}>
            {resetMutation.isPending ? "Updating..." : "Update Password"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}