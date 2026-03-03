import { Card, CardActions, CardContent } from "@mui/material";
import { styled } from "@mui/material/styles";

interface AccountCardProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function AccountCard({ children, actions }: AccountCardProps) {
  return (
    <StyledCard>
      <CardContent>{children}</CardContent>
      <StyledActions>{actions}</StyledActions>
    </StyledCard>
  );
}

const StyledCard = styled(Card)(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "column",
  transition: "transform 0.2s, box-shadow 0.2s",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: theme.shadows[4],
  },
}));

const StyledActions = styled(CardActions)(({ theme }) => ({
  marginTop: "auto",
  padding: theme.spacing(2),
  paddingTop: 0,
}));