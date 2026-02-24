import { Box, Button, Typography } from '@mui/material'
import { styled } from '@mui/material/styles'

export const StyledBox = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  display: 'flex',
  justifyContent: 'center',
}))

export const StyledSectionTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(3),
}))
