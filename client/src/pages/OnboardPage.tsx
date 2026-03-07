"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
} from "@mui/material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSnackbar } from "../contexts/SnackbarContext";
import { assetUrl } from "../lib/api-base";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { onboardingUser, canOnboard, isLoading } = useAuth();
  const { showError, showSuccess } = useSnackbar();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      showError("Passwords do not match");
      return;
    }

    if (password.length < 15) {
      showError("Password must be at least 15 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      await onboardingUser({ name, username, password, email });
      showSuccess("Account created successfully!");
      setTimeout(() => {
        navigate("/");
      }, 100);
    } catch (err: any) {
      showError(err.message || "Failed to create account");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !canOnboard) {
      navigate("/");
    }
  }, [canOnboard, isLoading, navigate]);

  if (isLoading) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        p: 2,
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 500 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box
              component="img"
              src={assetUrl("/assets/logo.png")}
              alt="TXLS"
              sx={{
                width: 80,
                height: 80,
                objectFit: "contain",
                mb: 2,
              }}
            />
            <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
              TXLS
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Setup your admin account
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              No users exist yet. Create the first admin account to get started.
            </Typography>
          </Alert>

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              required
              autoComplete="name"
              autoFocus
            />

            <TextField
              fullWidth
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
              autoComplete="username"
            />

            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoComplete="email"
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              autoComplete="new-password"
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
              autoComplete="new-password"
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Account"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}