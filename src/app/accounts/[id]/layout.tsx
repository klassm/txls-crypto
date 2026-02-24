import { dehydrate, QueryClient, HydrationBoundary } from '@tanstack/react-query'
import { cookies } from 'next/headers'
import { getDataSource } from '@/lib/database'
import { AccountsService } from '@/server/modules/accounts/accounts.service'
import { TransactionsService } from '@/server/modules/transactions/transactions.service'
import { TransactionsRepository } from '@/server/modules/transactions/transactions.repository'
import { AUTH_COOKIE_NAME, verifyToken } from '@/lib/utils/password'

export const dynamic = 'force-dynamic'

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const accountId = Number.parseInt(id, 10)
  
  if (Number.isNaN(accountId)) {
    return <>{children}</>
  }

  const queryClient = new QueryClient()
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (token) {
    const payload = verifyToken(token)
    if (payload?.userId) {
      const dataSource = await getDataSource()
      const accountsService = new AccountsService(undefined, dataSource)
      const transactionsRepository = new TransactionsRepository(dataSource)
      const transactionsService = new TransactionsService(transactionsRepository)
      
      const account = await accountsService.findById(payload.userId, accountId)
      if (account) {
        queryClient.setQueryData(['account', accountId], account)
      }

      const currentYear = new Date().getFullYear()
      const transactionsData = await transactionsService.findByProviderAccountIdWithStats(payload.userId, accountId, currentYear)
      if (transactionsData) {
        queryClient.setQueryData(['transactions', accountId, currentYear], transactionsData)
      }
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}
