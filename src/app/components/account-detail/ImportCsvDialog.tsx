"use client";

import { Upload, Close } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  CircularProgress,
  IconButton,
} from "@mui/material";
import React, { useRef, useState, useEffect } from "react";

interface ImportCsvDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
  isImporting: boolean;
}

export function ImportCsvDialog({
  open,
  onClose,
  onImport,
  isImporting,
}: ImportCsvDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    await onImport(selectedFile);
  };

  const handleClose = () => {
    setSelectedFile(null);
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={isImporting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: 400 } }}
    >
      <DialogTitle>
        Import CSV
        <IconButton
          onClick={handleClose}
          disabled={isImporting}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {isImporting ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Importing transactions...</Typography>
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            <Box
              sx={{
                border: "2px dashed",
                borderColor: "divider",
                borderRadius: 1,
                p: 4,
                textAlign: "center",
                mb: 2,
                cursor: "pointer",
                "&:hover": { borderColor: "primary.main" },
              }}
              onClick={handleBrowseClick}
            >
              <Upload sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
              {selectedFile ? (
                <Typography variant="body1">{selectedFile.name}</Typography>
              ) : (
                <>
                  <Typography variant="body1" color="text.secondary">
                    Drag and drop your CSV file here, or
                  </Typography>
                  <Button variant="text" sx={{ mt: 1 }}>
                    browse files
                  </Button>
                </>
              )}
            </Box>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: "none" }}
              ref={fileInputRef}
            />
          </Box>
        )}
      </DialogContent>
      {!isImporting && (
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!selectedFile}
          >
            Upload
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}