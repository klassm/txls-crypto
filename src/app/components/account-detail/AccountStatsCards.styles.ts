import { Box, Card, Grid, Stack, Typography } from '@mui/material'
import { styled } from '@mui/material/styles'

export const StyledStatsGrid = styled(Grid)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}))

export const StyledCard = styled(Card)(({ theme }) => ({
  boxShadow: theme.shadows[2],
  borderRadius: theme.spacing(2),
}))

export const StyledLogoBox = styled(Box)<{ bgcolor?: string }>(({ theme, bgcolor = '#000' }) => ({
  width: 64,
  height: 64,
  borderRadius: theme.spacing(2),
  backgroundColor: bgcolor,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: theme.shadows[2],
}))

export const StyledLogoText = styled(Typography)(({ theme }) => ({
  color: 'white',
  fontWeight: 'bold',
}))

export const StyledLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
}))
