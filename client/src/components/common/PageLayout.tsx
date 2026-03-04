import { AppBar, Container, ContainerProps, Toolbar, Typography, Box } from '@mui/material'
import UserMenu from '../UserMenu'
import { assetUrl } from '../../lib/api-base'

interface PageLayoutProps extends ContainerProps {
  children: React.ReactNode
}

export function PageLayout({ children, maxWidth = 'xl', sx, ...props }: PageLayoutProps) {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Box
            component="img"
            src={assetUrl("/assets/logo.png")}
            alt="TXLS Logo"
            sx={{ height: 40, mr: 2 }}
          />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            TXLS
          </Typography>
          <Box sx={{ ml: 2 }}>
            <UserMenu />
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth={maxWidth} sx={{ pt: 3, ...sx }} {...props}>
        {children}
      </Container>
    </>
  )
}