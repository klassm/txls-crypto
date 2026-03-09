import { DateTime } from "luxon";

export enum ProviderType {
	Bitpanda = "bitpanda",
	TradeRepublic = "traderepublic",
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export interface CreateOnboardingUserDto {
  name: string;
  username: string;
  password: string;
  email: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface Provider {
  id: number;
  userId: number;
  type: ProviderType;
  source?: ProviderType;
  name: string;
  logoBackgroundColor: string;
  logoForegroundColor: string;
  logoPath: string;
  csvImportMarkdownInstructions: string;
  csvImportAllowed: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
  assets?: AssetStat[];
}

export interface CreateProviderDto {
  type?: ProviderType;
  provider?: ProviderType;
  name?: string;
}

export interface UpdateProviderDto {
  provider?: ProviderType;
  type?: ProviderType;
  name?: string;
}

export enum TransactionType {
  buy = "buy",
  sell = "sell",
  stake = "stake",
  unstake = "unstake",
  reward = "reward",
  deposit = "deposit",
  transfer_in = "transfer_in",
  transfer_out = "transfer_out",
}

export interface Transaction {
  id: number;
  providerAccountId: number;
  externalId: string;
  timestamp: DateTime;
  type: TransactionType;
  asset: string;
  quantity: number;
  eurValue: number;
  eurFee: number;
  eurRate: number;
  processed: boolean;
}

export interface ProviderTransactionsDocument {
  provider: Provider;
  transactions: Transaction[];
  stats: YearStats;
  availableYears: number[];
}

export interface AssetStat {
  asset: string;
  amount: number;
  buys: number;
  sells: number;
}

export interface TransactionSummary {
  cryptoAmount: number;
  fiatAmount: number;
  count: number;
}

export interface YearStats {
  year: number;
  staking: TransactionSummary;
  buys: TransactionSummary;
  sells: TransactionSummary;
  assetStats: AssetStat[];
}

export type ApiError = {
  statusCode: number;
  message: string;
  details?: Record<string, unknown>;
};

export interface TaxCalculation {
  asset: string;
  transactions: TaxTransaction[];
  totalGain: number;
  totalLoss: number;
}

export type TaxExemptionReason =
  | "long_term_holding"
  | "exemption_limit_1000"
  | "exemption_limit_256_staking"
  | "none";

export interface TaxTransaction {
  date: DateTime;
  type: "buy" | "sell";
  asset: string;
  quantity: number;
  pricePerUnit: number;
  fee: number;
  costBasis: number;
  proceeds: number;
  gainLoss: number;
  holdingPeriodDays?: number;
  isTaxFree: boolean;
  exemptionReason: TaxExemptionReason;
}

export type Account = Provider & { provider: ProviderType };
export type CreateAccountDto = CreateProviderDto;
export type UpdateAccountDto = UpdateProviderDto;
export type AccountTransactionsDocument = ProviderTransactionsDocument;
