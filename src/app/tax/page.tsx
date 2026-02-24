"use client";

import { Suspense } from "react";
import TaxPageContent from "./TaxPageContent";
import { CircularProgress, Box } from "@mui/material";

export default function TaxPage() {
  return (
    <Suspense fallback={
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    }>
      <TaxPageContent />
    </Suspense>
  );
}