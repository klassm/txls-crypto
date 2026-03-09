import { AppBar, Container, ContainerProps, Toolbar, Typography, Box, Button } from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'
import UserMenu from '../UserMenu'
import { assetUrl } from '../../lib/api-base'
import { useAccounts } from '../../hooks'

interface PageLayoutProps extends ContainerProps {
  children: React.ReactNode
}

export function PageLayout({ children, maxWidth = 'xl', sx, ...props }: PageLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: accounts = [] } = useAccounts();

  const hasAccounts = accounts.length > 0;

  const handleLogoClick = () => {
    navigate(hasAccounts ? '/portfolio' : '/accounts');
  };

  const navItems = [
    { label: 'Portfolio', path: '/portfolio' },
    { label: 'Accounts', path: '/accounts' },
    { label: 'Tax', path: '/tax' },
  ];

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Box
            component="img"
            src={assetUrl("/assets/logo.png")}
            alt="TXLS Logo"
            sx={{ height: 40, mr: 2, cursor: 'pointer' }}
            onClick={handleLogoClick}
          />
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ flexGrow: 1, cursor: 'pointer' }}
            onClick={handleLogoClick}
          >
            TXLS
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                color="inherit"
                onClick={() => navigate(item.path)}
                sx={{
                  fontWeight: location.pathname === item.path ? 'bold' : 'normal',
                  textDecoration: location.pathname === item.path ? 'underline' : 'none',
                  textUnderlineOffset: 4,
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
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