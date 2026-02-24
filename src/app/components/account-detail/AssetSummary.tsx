"use client";

import { Typography } from "@mui/material";
import { type MRT_ColumnDef, MaterialReactTable } from "material-react-table";
import { StyledSectionTitle } from "./AssetSummary.styles";

interface AssetStat {
  asset: string;
  amount: number;
  buys: number;
  sells: number;
}

interface AssetSummaryProps {
  stats: AssetStat[];
  year: number;
}

export function AssetSummary({ stats, year }: AssetSummaryProps) {
  const filteredStats = stats.filter((stat) => stat.amount !== 0);

  const columns: MRT_ColumnDef<AssetStat>[] = [
    {
      accessorKey: "asset",
      header: "Asset",
      size: 100,
    },
    {
      accessorKey: "amount",
      header: "Total Amount",
      size: 150,
      Cell: ({ cell }) => Number(cell.getValue<number>()).toFixed(8),
    },
    {
      accessorKey: "buys",
      header: "Buys",
      size: 80,
    },
    {
      accessorKey: "sells",
      header: "Sells",
      size: 80,
    },
  ];

  if (filteredStats.length === 0) {
    return null;
  }

  return (
    <>
      <StyledSectionTitle variant="h5">
        Asset Summary
      </StyledSectionTitle>
      <MaterialReactTable
        columns={columns}
        data={filteredStats}
        enableSorting
        muiTablePaperProps={{
          elevation: 0,
          sx: { boxShadow: "none", marginBottom: 4 },
        }}
      />
    </>
  );
}
