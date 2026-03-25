import { Box, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

export const StyledBox = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(3),
  marginBottom: theme.spacing(2),
  display: "flex",
  justifyContent: "center",
}));

export const StyledSectionTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(3),
}));
