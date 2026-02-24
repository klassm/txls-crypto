"use client";

import { CloudUpload } from "@mui/icons-material";
import { Box, Button, Chip } from "@mui/material";
import { type MRT_ColumnDef, MaterialReactTable } from "material-react-table";
import type { Transaction } from "@/lib/types";
import { TransactionType } from "@/lib/types";
import { StyledBox, StyledSectionTitle } from "./TransactionsTable.styles";
import { DateTime } from "luxon";

interface TransactionsTableProps {
  transactions: Transaction[];
  onImport: () => void;
  csvImportAllowed: boolean;
}

export function TransactionsTable({
  transactions,
  onImport,
  csvImportAllowed,
}: TransactionsTableProps) {
  const getTypeColor = (type: TransactionType) => {
    switch (type) {
      case TransactionType.buy:
        return "success";
      case TransactionType.sell:
        return "error";
      case TransactionType.reward:
        return "info";
      default:
        return "default";
    }
  };

  const columns: MRT_ColumnDef<Transaction>[] = [
    {
      accessorKey: "timestamp",
      header: "Date",
      size: 120,
      Cell: ({ cell }) => {
        const dt = DateTime.fromISO(cell.getValue<string>());
        return dt.isValid ? dt.toLocaleString() : "-";
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      size: 80,
      Cell: ({ cell }) => {
        const type = cell.getValue<string>() as TransactionType;
        return (
          <Chip
            label={type.toUpperCase()}
            color={getTypeColor(type) as any}
            size="small"
          />
        );
      },
    },
    {
      accessorKey: "asset",
      header: "Asset",
      size: 80,
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      size: 120,
      Cell: ({ cell }) => Number(cell.getValue<number>()).toFixed(8),
    },
    {
      accessorKey: "eurValue",
      header: "EUR Value",
      size: 120,
      Cell: ({ cell }) => `€${Number(cell.getValue<number>()).toFixed(2)}`,
    },
    {
      accessorKey: "eurFee",
      header: "EUR Fee",
      size: 100,
      Cell: ({ cell }) => `€${Number(cell.getValue<number>()).toFixed(2)}`,
    },
    {
      accessorKey: "externalId",
      header: "External ID",
      size: 200,
    },
  ];

  return (
    <Box>
      <StyledSectionTitle variant="h5">Transactions</StyledSectionTitle>
      <MaterialReactTable
        columns={columns}
        data={transactions}
        enableSorting
        enableFilters
        initialState={{
          sorting: [{ id: "timestamp", desc: true }],
          pagination: { pageSize: 100, pageIndex: 0 },
        }}
        muiTablePaperProps={{
          elevation: 0,
          sx: { boxShadow: "none" },
        }}
        muiTableContainerProps={{
          sx: { maxHeight: "calc(100vh - 200px)" },
        }}
      />
      {csvImportAllowed && (
        <StyledBox>
          <Button
            variant="contained"
            color="primary"
            onClick={onImport}
            startIcon={<CloudUpload />}
          >
            Import CSV
          </Button>
        </StyledBox>
      )}
    </Box>
  );
}
