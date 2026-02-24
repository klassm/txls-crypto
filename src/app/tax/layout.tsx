import { dehydrate, QueryClient, HydrationBoundary } from '@tanstack/react-query'
import { cookies } from 'next/headers'
import { getDataSource } from '@/lib/database'
import { TransactionsRepository } from '@/server/modules/transactions/transactions.repository'
import { AccountsRepository } from '@/server/modules/accounts/accounts.repository'
import { TaxCalculationService } from '@/server/modules/tax/tax-calculator.service'
import { toISOString } from '@/lib/utils/date'
import { DateTime } from 'luxon'
import { TransactionType } from '@/lib/types'
import { AUTH_COOKIE_NAME, verifyToken } from '@/lib/utils/password'

export const dynamic = 'force-dynamic'

async function getCombinedTaxData(userId: number, year: number) {
  const dataSource = await getDataSource()
  const transactionsRepository = new TransactionsRepository(dataSource)
  const accountsRepository = new AccountsRepository(dataSource)
  
  const accounts = await accountsRepository.findAll(userId)

  const mapEntityToTransaction = (e: any) => ({
    id: e.id,
    providerAccountId: e.providerAccountId,
    externalId: e.externalId,
    timestamp: e.timestamp,
    type: e.type,
    asset: e.asset,
    quantity: e.quantity,
    eurValue: e.eurValue,
    eurFee: e.eurFee,
    processed: e.processed,
  })

  const allTransactions = (
    await Promise.all(
      accounts.map((account) =>
        transactionsRepository.findByProviderAccountId(userId, account.id)
          .then((entities) => entities.map(mapEntityToTransaction))
      )
    )
  ).flat()

  const taxCalculator = new TaxCalculationService()
  const taxResult = taxCalculator.calculateTaxForYear(
    allTransactions.filter((t: any) => t.type !== TransactionType.deposit),
    year,
  )

  const taxRecords = Array.from(taxResult.assetCalculations.values())
    .flatMap((calc) => calc.transactions)
    .sort((a, b) => a.date.toMillis() - b.date.toMillis())

  const totalGain = taxRecords
    .filter((t) => !t.isTaxFree && t.gainLoss >= 0)
    .reduce((sum, t) => sum + t.gainLoss, 0)
  const totalLoss = taxRecords
    .filter((t) => !t.isTaxFree && t.gainLoss < 0)
    .reduce((sum, t) => sum + Math.abs(t.gainLoss), 0)

  const serializedTransactions = taxRecords.map((tx) => ({
    ...tx,
    date: toISOString(tx.date) ?? '',
  }))

  return {
    year,
    transactions: serializedTransactions,
    totalGain,
    totalLoss,
    stakingRewards: taxResult.stakingRewardsExempt + taxResult.stakingRewardsTaxable,
    totalStakingRewards: taxResult.stakingRewardsExempt + taxResult.stakingRewardsTaxable,
    stakingRewardsExempt: taxResult.stakingRewardsExempt,
    stakingRewardsTaxable: taxResult.stakingRewardsTaxable,
    lossCarryover: taxResult.lossCarryover,
    includedAccounts: accounts.map((a) => ({
      id: a.id,
      source: a.provider,
    })),
  }
}

export default async function TaxLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = new QueryClient()
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (token) {
    const payload = verifyToken(token)
    if (payload?.userId) {
      const currentYear = DateTime.now().year
      const taxData = await getCombinedTaxData(payload.userId, currentYear)
      queryClient.setQueryData(['tax', 'combined', currentYear], taxData)
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}
