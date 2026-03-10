'use client'

import { CloudUpload, Sync, Check as CheckIcon, ArrowDropDown } from '@mui/icons-material'
import { Button, Typography, Box, TextField, CircularProgress, Alert, Menu, MenuItem, ButtonGroup } from '@mui/material'
import { useState } from 'react'
import { StyledEmptyBox } from './EmptyState.styles'
import { accountsApi } from '../../lib/client/accounts-api'

interface EmptyStateProps {
  onImport: () => void
  csvImportAllowed: boolean
  apiSyncEnabled: boolean
  hasApiKey: boolean
  accountId: number
  onSyncComplete?: () => void
}

export function EmptyState({ onImport, csvImportAllowed, apiSyncEnabled, hasApiKey, accountId, onSyncComplete }: EmptyStateProps) {
  const [apiKey, setApiKey] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [syncMenuAnchor, setSyncMenuAnchor] = useState<null | HTMLElement>(null)

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await accountsApi.updateApiSettings(accountId, {
        apiEnabled: true,
        apiKey: apiKey.trim(),
      })
      setApiKey("")
      setSuccess("API key saved")
      onSyncComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key")
    } finally {
      setIsSaving(false)
    }
  }

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

  if (apiSyncEnabled) {
    if (!hasApiKey) {
      return (
        <StyledEmptyBox>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No transactions found. Enter your Bitpanda API key to sync.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2, width: "100%" }} onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2, width: "100%" }} onClose={() => setSuccess(null)}>{success}</Alert>}
          <Box sx={{ display: "flex", gap: 1, width: "100%", maxWidth: 400 }}>
            <TextField
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              size="small"
              fullWidth
              disabled={isSaving}
            />
            <Button
              variant="contained"
              onClick={handleSaveApiKey}
              disabled={isSaving || !apiKey.trim()}
              startIcon={isSaving ? <CircularProgress size={20} /> : <CheckIcon />}
            >
              Save
            </Button>
          </Box>
        </StyledEmptyBox>
      )
    }

    return (
      <StyledEmptyBox>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No transactions found. Sync to import from Bitpanda.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2, width: "100%" }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, width: "100%" }} onClose={() => setSuccess(null)}>{success}</Alert>}
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
