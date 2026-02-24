'use client'

import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider, HydrationBoundary } from '@tanstack/react-query'
import { useState, useMemo, type ReactNode } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import type { DehydratedState } from '@tanstack/react-query'

interface ProvidersProps {
  children: ReactNode
  dehydratedState?: DehydratedState
}

export function Providers({ children, dehydratedState }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            refetchOnMount: false,
          },
        },
      })
  )

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          primary: {
            main: '#1976d2',
          },
          secondary: {
            main: '#dc004e',
          },
        },
      }),
    []
  )

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  )
}
