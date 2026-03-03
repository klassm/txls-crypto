import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";

export const StyledEmptyBox = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(4),
}));
