import { Box, Container, ContainerProps } from '@mui/material'

interface PageLayoutProps extends ContainerProps {
  children: React.ReactNode
}

export function PageLayout({ children, maxWidth = 'xl', sx, ...props }: PageLayoutProps) {
  return (
    <Container maxWidth={maxWidth} sx={{ pt: 3, ...sx }} {...props}>
      {children}
    </Container>
  )
}