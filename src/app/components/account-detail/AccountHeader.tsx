"use client";

import { ArrowBack } from "@mui/icons-material";
import { Button, MenuItem, Select } from "@mui/material";
import type { ProviderType } from "../../../lib/types/index.js";
import {
  StyledFormControl,
  StyledHeader,
  StyledTitle,
} from "./AccountHeader.styles";

interface AccountHeaderProps {
  provider: ProviderType;
  onBack: () => void;
  selectedYear: number;
  onYearChange: (year: number) => void;
  yearOptions: number[];
}

export function AccountHeader({
  provider,
  onBack,
  selectedYear,
  onYearChange,
  yearOptions,
}: AccountHeaderProps) {
  return (
    <StyledHeader direction="row">
      <Button startIcon={<ArrowBack />} onClick={onBack}>
        Back
      </Button>
      <StyledTitle variant="h4" component="h1">
        {provider}
      </StyledTitle>
      <StyledFormControl size="small">
        <Select
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {yearOptions.map((year) => (
            <MenuItem key={year} value={year}>
              {year}
            </MenuItem>
          ))}
        </Select>
      </StyledFormControl>
    </StyledHeader>
  );
}
