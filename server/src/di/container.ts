import "reflect-metadata";
import { Container } from "inversify";
import { DataSource } from "typeorm";
import { TYPES } from "./types.js";

import { AccountsRepository } from "../modules/accounts/accounts.repository.js";
import { TransactionsRepository } from "../modules/transactions/transactions.repository.js";
import { UsersRepository } from "../modules/users/users.repository.js";
import { AssetHoldingsRepository } from "../modules/asset-holdings/asset-holdings.repository.js";
import { PricesRepository } from "../modules/prices/prices.repository.js";
import { ProvidersRepository } from "../modules/providers/providers.repository.js";

import { AccountsService } from "../modules/accounts/accounts.service.js";
import { TransactionsService } from "../modules/transactions/transactions.service.js";
import { UsersService } from "../modules/users/users.service.js";
import { AssetHoldingsService } from "../modules/asset-holdings/asset-holdings.service.js";
import { PricesService } from "../modules/prices/prices.service.js";
import { PriceFetcherService } from "../modules/prices/price-fetcher.service.js";
import { PriceBackfillService } from "../modules/prices/price-backfill.service.js";
import { CoinGeckoService } from "../modules/prices/coingecko.service.js";
import { ApiSyncService } from "../modules/api-sync/api-sync.service.js";
import { TransferMatchingService } from "../modules/transfers/transfer-matching.service.js";
import { TaxCalculationService } from "../modules/tax/tax-calculator.service.js";
import { WisoCsvExportService } from "../modules/tax/wiso-csv-export.service.js";
import { ImportDeduplicationService } from "../providers/import-deduplication.service.js";
import { ApiSyncScheduler } from "../api-sync-scheduler.js";

let container: Container | null = null;

export function createContainer(dataSource: DataSource): Container {
  if (container) {
    return container;
  }

  container = new Container();

  container.bind<DataSource>(TYPES.DataSource).toConstantValue(dataSource);

  container.bind<AccountsRepository>(TYPES.AccountsRepository).to(AccountsRepository).inSingletonScope();
  container.bind<TransactionsRepository>(TYPES.TransactionsRepository).to(TransactionsRepository).inSingletonScope();
  container.bind<UsersRepository>(TYPES.UsersRepository).to(UsersRepository).inSingletonScope();
  container.bind<AssetHoldingsRepository>(TYPES.AssetHoldingsRepository).to(AssetHoldingsRepository).inSingletonScope();
  container.bind<PricesRepository>(TYPES.PricesRepository).to(PricesRepository).inSingletonScope();
  container.bind<ProvidersRepository>(TYPES.ProvidersRepository).to(ProvidersRepository).inSingletonScope();

  container.bind<AccountsService>(TYPES.AccountsService).to(AccountsService).inSingletonScope();
  container.bind<TransactionsService>(TYPES.TransactionsService).to(TransactionsService).inSingletonScope();
  container.bind<UsersService>(TYPES.UsersService).to(UsersService).inSingletonScope();
  container.bind<AssetHoldingsService>(TYPES.AssetHoldingsService).to(AssetHoldingsService).inSingletonScope();
  container.bind<PricesService>(TYPES.PricesService).to(PricesService).inSingletonScope();
  container.bind<PriceFetcherService>(TYPES.PriceFetcherService).to(PriceFetcherService).inSingletonScope();
  container.bind<PriceBackfillService>(TYPES.PriceBackfillService).to(PriceBackfillService).inSingletonScope();
  container.bind<CoinGeckoService>(TYPES.CoinGeckoService).to(CoinGeckoService).inSingletonScope();
  container.bind<ApiSyncService>(TYPES.ApiSyncService).to(ApiSyncService).inSingletonScope();
  container.bind<TransferMatchingService>(TYPES.TransferMatchingService).to(TransferMatchingService).inSingletonScope();
  container.bind<TaxCalculationService>(TYPES.TaxCalculationService).to(TaxCalculationService).inSingletonScope();
  container.bind<WisoCsvExportService>(TYPES.WisoCsvExportService).to(WisoCsvExportService).inSingletonScope();
  container.bind<ImportDeduplicationService>(TYPES.ImportDeduplicationService).to(ImportDeduplicationService).inTransientScope();
  container.bind<ApiSyncScheduler>(TYPES.ApiSyncScheduler).to(ApiSyncScheduler).inSingletonScope();

  return container;
}

export function getContainer(): Container {
  if (!container) {
    throw new Error("Container not initialized. Call createContainer first.");
  }
  return container;
}

export function resetContainer(): void {
  if (container) {
    container.unbindAll();
    container = null;
  }
}
