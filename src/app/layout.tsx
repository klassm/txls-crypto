import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { AppBar, Box, Toolbar, Typography } from '@mui/material'
import Link from 'next/link'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { SnackbarProvider } from './contexts/SnackbarContext'
import { Providers } from './providers'
import UserMenu from './components/UserMenu'
import { AuthGuard } from './components/AuthGuard'
import { config } from '@/server/config/env'
import { getDataSource } from '@/lib/database'
import { UsersService } from '@/server/modules/users/users.service'
import { AccountsService } from '@/server/modules/accounts/accounts.service'
import { toISOString } from '@/lib/utils/date'
import { sources } from '@/server/sources/registry'
import { ProviderType } from '@/lib/types'
import { AUTH_COOKIE_NAME, verifyToken } from '@/lib/utils/password'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'TXLS - Crypto Analysis',
  description: 'Cryptocurrency transaction analysis platform',
}

const providerRegistryMapping: Record<string, ProviderType> = {
  bitpanda: ProviderType.Bitpanda,
  tradeRepublic: ProviderType.TradeRepublic,
}

async function prefetchQueryData(queryClient: QueryClient) {
  const dataSource = await getDataSource()
  const usersService = new UsersService(undefined, dataSource)
  const existingUsersCount = await usersService.count()

  let user = null
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (token) {
    const payload = verifyToken(token)
    if (payload?.userId) {
      user = await usersService.findById(payload.userId)
      if (user) {
        user = {
          ...user,
          createdAt: toISOString(user.createdAt) ?? '',
          updatedAt: toISOString(user.updatedAt) ?? '',
        }
      }
    }
  }

  const headersList = await headers()
  const ingressPath = headersList.get('x-ingress-path')
  const hassIngress = !!ingressPath && !!config.homeAssistant.supervisorToken

  queryClient.setQueryData(['config'], {
    canOnboard: existingUsersCount === 0,
    user,
    hassIngress,
  })

  if (token) {
    const payload = verifyToken(token)
    if (payload?.userId) {
      const accountsService = new AccountsService(undefined, dataSource)
      const accounts = await accountsService.findAll(payload.userId)
      queryClient.setQueryData(['accounts'], accounts)
    }
  }

  const sourcesData = Object.entries(sources).map(([key, value]) => ({
    source: providerRegistryMapping[key] || (key as ProviderType),
    name: value.name,
    logoBackgroundColor: value.logoBackgroundColor,
    logoForegroundColor: value.logoForegroundColor,
    logoPath: value.logoPath,
    csvImportMarkdownInstructions: value.csvImportMarkdownInstructions,
    csvImportAllowed: value.csvImporter !== undefined,
  }))
  queryClient.setQueryData(['sources'], sourcesData)
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = new QueryClient()

  await prefetchQueryData(queryClient)

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers dehydratedState={dehydrate(queryClient)}>
          <SnackbarProvider>
            <AuthGuard>
              <Box>
                <AppBar position="static" elevation={0}>
                  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
                      <Box
                        component="img"
                        src="/assets/logo.png"
                        alt="TXLS"
                        sx={{
                          width: 40,
                          height: 40,
                          objectFit: 'contain',
                          cursor: 'pointer',
                        }}
                      />
                      <Typography variant="h6" component="h1" fontWeight="bold" sx={{ ml: 1, cursor: 'pointer' }}>
                        TXLS
                      </Typography>
                    </Link>
                    <Box>
                      <UserMenu />
                    </Box>
                  </Toolbar>
                </AppBar>
                {children}
              </Box>
            </AuthGuard>
          </SnackbarProvider>
        </Providers>
      </body>
    </html>
  )
}