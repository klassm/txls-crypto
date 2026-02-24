import { Card, CardContent, Typography } from "@mui/material";
import { StyledCard, StyledLabel } from "./StatCard.styles";

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
}

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <StyledCard>
      <CardContent>
        <StyledLabel>{label}</StyledLabel>
        <Typography variant="h4" fontWeight={600} color="info.main">
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </StyledCard>
  );
}