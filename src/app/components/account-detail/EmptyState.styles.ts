import { Box } from '@mui/material'
import { styled } from '@mui/material/styles'

export const StyledEmptyBox = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  padding: theme.spacing(8),
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
}))
