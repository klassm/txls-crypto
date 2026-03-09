"use client";

import { useAuth } from "../contexts/AuthContext";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
} from "@mui/material";
import { assetUrl } from "../lib/api-base";

export default function AuthErrorPage() {
  const { authError, hassIngress } = useAuth();

  const handleRetry = () => {
    window.location.reload();
  };

  const getErrorMessage = () => {
    if (authError === "home_assistant_unavailable") {
      return {
        title: "Home Assistant Unavailable",
        message: "Unable to connect to Home Assistant. Please check if Home Assistant is running and try again.",
      };
    }
    return {
      title: "Authentication Error",
      message: "An error occurred during authentication. Please try again.",
    };
  };

  const { title, message } = getErrorMessage();

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
          </Box>

          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              {title}
            </Typography>
            <Typography variant="body2">
              {message}
            </Typography>
          </Alert>

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleRetry}
          >
            Retry
          </Button>

          {hassIngress && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
              If the problem persists, please check the Home Assistant logs for more information.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
