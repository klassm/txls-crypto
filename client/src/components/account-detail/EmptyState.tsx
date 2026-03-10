'use client'

import { CloudUpload, Sync, Key, ArrowDropDown } from '@mui/icons-material'
import { Button, Typography, Box, CircularProgress, Alert, Menu, MenuItem, ButtonGroup } from '@mui/material'
import { useState } from 'react'
import { StyledEmptyBox } from './EmptyState.styles'
import { accountsApi } from '../../lib/client/accounts-api'

interface EmptyStateProps {
  onImport: () => void
  csvImportAllowed: boolean
  apiSettings?: {
    apiEnabled: boolean
    hasApiKey: boolean
    supportsApiSync: boolean
  }
  accountId: number
  onSyncComplete?: () => void
  onConfigureApiKey: () => void
}

export function EmptyState({ 
  onImport, 
  csvImportAllowed, 
  apiSettings, 
  accountId, 
  onSyncComplete,
  onConfigureApiKey 
}: EmptyStateProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncMenuAnchor, setSyncMenuAnchor] = useState<null | HTMLElement>(null)

  const handleSync = async (fullSync = false) => {
    setIsSyncing(true)
    setError(null)
    setSyncMenuAnchor(null)

    try {
      const result = await accountsApi.triggerSync(accountId, fullSync)
      if (result.success) {
        setSuccess(`Synced ${result.imported} transactions`)
        onSyncComplete?.()
      } else {
        setError(result.error || "Sync failed")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync")
    } finally {
      setIsSyncing(false)
    }
  }

  const supportsApiSync = apiSettings?.supportsApiSync ?? false
  const hasApiKey = apiSettings?.hasApiKey ?? false

  if (supportsApiSync && hasApiKey) {
    return (
      <StyledEmptyBox>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No transactions found. Sync to import from Bitpanda.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2, width: "100%" }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, width: "100%" }} onClose={() => setSuccess(null)}>{success}</Alert>}
        <Box sx={{ display: "flex", gap: 1 }}>
          <ButtonGroup variant="contained">
            <Button
              onClick={() => handleSync(false)}
              disabled={isSyncing}
              startIcon={isSyncing ? <CircularProgress size={20} /> : <Sync />}
            >
              Sync Now
            </Button>
            <Button
              size="small"
              onClick={(e) => setSyncMenuAnchor(e.currentTarget)}
              disabled={isSyncing}
            >
              <ArrowDropDown />
            </Button>
          </ButtonGroup>
          <Button
            variant="outlined"
            onClick={onConfigureApiKey}
            startIcon={<Key />}
          >
            Settings
          </Button>
        </Box>
        <Menu
          anchorEl={syncMenuAnchor}
          open={Boolean(syncMenuAnchor)}
          onClose={() => setSyncMenuAnchor(null)}
        >
          <MenuItem onClick={() => handleSync(false)}>
            Incremental Sync
          </MenuItem>
          <MenuItem onClick={() => handleSync(true)}>
            Full Sync (reimport all)
          </MenuItem>
        </Menu>
      </StyledEmptyBox>
    )
  }

  if (supportsApiSync && !hasApiKey) {
    return (
      <StyledEmptyBox>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No transactions found. Configure API sync to import from Bitpanda.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2, width: "100%" }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, width: "100%" }} onClose={() => setSuccess(null)}>{success}</Alert>}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={onConfigureApiKey} startIcon={<Key />}>
            Configure API Sync
          </Button>
          {csvImportAllowed && (
            <Button variant="outlined" onClick={onImport} startIcon={<CloudUpload />}>
              Import CSV
            </Button>
          )}
        </Box>
      </StyledEmptyBox>
    )
  }

  if (!csvImportAllowed) {
    return (
      <StyledEmptyBox>
        <Typography variant="body1" color="text.secondary">
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
