"use client";

import { ArrowBack } from "@mui/icons-material";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  selectedYear?: number;
  onYearChange?: (year: number) => void;
  yearOptions?: number[];
  backButtonLabel?: string;
  showYearLabel?: boolean;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  onBack,
  selectedYear,
  onYearChange,
  yearOptions,
  backButtonLabel = "Back",
  actions,
}: PageHeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 2 : 0,
        mb: 3,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        {onBack && (
          <Button variant="outlined" onClick={onBack} startIcon={<ArrowBack />}>
            {backButtonLabel}
          </Button>
        )}
        <Typography variant={isMobile ? "h5" : "h4"} component="h1">
          {title}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, justifyContent: isMobile ? "flex-end" : "flex-start" }}>
        {actions}
        {selectedYear !== undefined && onYearChange && yearOptions && (
          <FormControl sx={{ minWidth: 120 }} size="small">
            <InputLabel shrink>Year</InputLabel>
            <Select
              value={selectedYear}
              label="Year"
              onChange={(e) => onYearChange(Number(e.target.value))}
              notched
            >
              {yearOptions.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>
    </Box>
  );
}