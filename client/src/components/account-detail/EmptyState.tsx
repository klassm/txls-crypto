'use client'

import { CloudUpload } from '@mui/icons-material'
import { Button, Typography } from '@mui/material'
import { StyledEmptyBox } from './EmptyState.styles'

interface EmptyStateProps {
  onImport: () => void
  csvImportAllowed: boolean
}

export function EmptyState({ onImport, csvImportAllowed }: EmptyStateProps) {
  if (!csvImportAllowed) {
    return (
      <StyledEmptyBox>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No transactions found.
        </Typography>
      </StyledEmptyBox>
    )
  }

  return (
    <StyledEmptyBox>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        No transactions found. Import a CSV to get started.
      </Typography>
      <Button variant="contained" color="primary" onClick={onImport} startIcon={<CloudUpload />}>
        Import CSV
      </Button>
    </StyledEmptyBox>
  )
}
