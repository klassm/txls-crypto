import { getContainer } from "./container.js";
import { TYPES } from "./types.js";

import { AccountsService } from "../modules/accounts/accounts.service.js";
import { TransactionsService } from "../modules/transactions/transactions.service.js";
import { UsersService } from "../modules/users/users.service.js";
import { AssetHoldingsService } from "../modules/asset-holdings/asset-holdings.service.js";
import { PricesService } from "../modules/prices/prices.service.js";
import { PriceFetcherService } from "../modules/prices/price-fetcher.service.js";
import { PriceBackfillService } from "../modules/prices/price-backfill.service.js";
import { ApiSyncService } from "../modules/api-sync/api-sync.service.js";
import { TransferMatchingService } from "../modules/transfers/transfer-matching.service.js";
import { TaxCalculationService } from "../modules/tax/tax-calculator.service.js";
import { WisoCsvExportService } from "../modules/tax/wiso-csv-export.service.js";
import { ImportDeduplicationService } from "../providers/import-deduplication.service.js";
import { ApiSyncScheduler } from "../api-sync-scheduler.js";

import { AccountsRepository } from "../modules/accounts/accounts.repository.js";
import { TransactionsRepository } from "../modules/transactions/transactions.repository.js";
import { UsersRepository } from "../modules/users/users.repository.js";
import { PricesRepository } from "../modules/prices/prices.repository.js";

export function getAccountsService(): AccountsService {
  return getContainer().get<AccountsService>(TYPES.AccountsService);
}

export function getTransactionsService(): TransactionsService {
  return getContainer().get<TransactionsService>(TYPES.TransactionsService);
}

export function getUsersService(): UsersService {
  return getContainer().get<UsersService>(TYPES.UsersService);
}

export function getAssetHoldingsService(): AssetHoldingsService {
  return getContainer().get<AssetHoldingsService>(TYPES.AssetHoldingsService);
}

export function getPricesService(): PricesService {
  return getContainer().get<PricesService>(TYPES.PricesService);
}

export function getPriceFetcherService(): PriceFetcherService {
  return getContainer().get<PriceFetcherService>(TYPES.PriceFetcherService);
}

export function getPriceBackfillService(): PriceBackfillService {
  return getContainer().get<PriceBackfillService>(TYPES.PriceBackfillService);
}

export function getApiSyncService(): ApiSyncService {
  return getContainer().get<ApiSyncService>(TYPES.ApiSyncService);
}

export function getTransferMatchingService(): TransferMatchingService {
  return getContainer().get<TransferMatchingService>(TYPES.TransferMatchingService);
}

export function getTaxCalculationService(): TaxCalculationService {
  return getContainer().get<TaxCalculationService>(TYPES.TaxCalculationService);
}

export function getWisoCsvExportService(): WisoCsvExportService {
  return getContainer().get<WisoCsvExportService>(TYPES.WisoCsvExportService);
}

export function getImportDeduplicationService(): ImportDeduplicationService {
  return getContainer().get<ImportDeduplicationService>(TYPES.ImportDeduplicationService);
}

export function getApiSyncScheduler(): ApiSyncScheduler {
  return getContainer().get<ApiSyncScheduler>(TYPES.ApiSyncScheduler);
}

export function getAccountsRepository(): AccountsRepository {
  return getContainer().get<AccountsRepository>(TYPES.AccountsRepository);
}

export function getTransactionsRepository(): TransactionsRepository {
  return getContainer().get<TransactionsRepository>(TYPES.TransactionsRepository);
}

export function getUsersRepository(): UsersRepository {
  return getContainer().get<UsersRepository>(TYPES.UsersRepository);
}

export function getPricesRepository(): PricesRepository {
  return getContainer().get<PricesRepository>(TYPES.PricesRepository);
}
