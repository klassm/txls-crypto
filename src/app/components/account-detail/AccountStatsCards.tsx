"use client";

import { Grid } from "@mui/material";
import type { TransactionSummary } from "@/lib/types";
import { StatCard } from "./StatCard";
import { StyledStatsGrid } from "./AccountStatsCards.styles";

interface AccountStatsCardsProps {
  staking: TransactionSummary;
  buys: TransactionSummary;
  sells: TransactionSummary;
  year: number;
}

export function AccountStatsCards({
  staking,
  buys,
  sells,
  year,
}: AccountStatsCardsProps) {
  return (
    <StyledStatsGrid container spacing={3}>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <StatCard
          label="Staking"
          value={`€${staking.fiatAmount.toFixed(2)}`}
          subtitle={`${staking.count} transactions`}
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <StatCard
          label="Buys"
          value={`€${buys.fiatAmount.toFixed(2)}`}
          subtitle={`${buys.count} transactions`}
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <StatCard
          label="Sells"
          value={`€${sells.fiatAmount.toFixed(2)}`}
          subtitle={`${sells.count} transactions`}
        />
      </Grid>
    </StyledStatsGrid>
  );
}
