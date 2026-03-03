import { FormControl, Stack, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

export const StyledHeader = styled(Stack)(({ theme }) => ({
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: theme.spacing(4),
}));

export const StyledTitle = styled(Typography, {
  shouldForwardProp: (prop) => prop !== "variant" && prop !== "component",
})<{ variant?: string; component?: React.ElementType }>(() => ({
  fontWeight: 600,
}));

export const StyledFormControl = styled(FormControl)(() => ({
  minWidth: 120,
}));
