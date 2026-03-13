import { DateTime } from "luxon";
import type { Transaction } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import type { ApiSyncClient, ApiSyncResult } from "../types.js";
import { logger } from "../../common/logger.js";

const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";
const DEFAULT_PAGE_SIZE = 100;

interface FetchResult {
  transactions: Transaction[];
  stoppedEarly: boolean;
}

interface BitpandaFee {
  type: "fee";
  attributes: {
    fee_amount_in_fiat: string;
    fee_percentage?: string | null;
  };
}

interface BitpandaTrade {
  id: string;
  type: "trade";
  attributes: {
    status: string;
    type: "buy" | "sell" | "staking";
    cryptocoin_id: string;
    cryptocoin_symbol?: string;
    fiat_id: string;
    fiat_symbol?: string;
    amount_fiat: string;
    amount_cryptocoin: string;
    fiat_to_eur_rate: string;
    time: {
      date_iso8601: string;
      unix: string;
    };
    price: string;
    is_swap: boolean;
    is_fee_transparent?: boolean;
    fee?: string | BitpandaFee;
  };
}

interface BitpandaWalletTransaction {
  id: string;
  type: "wallet_transaction";
  attributes: {
    amount: string;
    recipient: string;
    time: {
      date_iso8601: string;
      unix: string;
    };
    confirmations: number;
    in_or_out: "incoming" | "outgoing";
    type: string;
    status: string;
    amount_eur: string;
    cryptocoin_id: string;
    cryptocoin_symbol: string;
    fee: string;
    current_fiat_id: string;
    current_fiat_amount: string;
    wallet_id: string;
    trade?: {
      id: string;
    };
    tags?: Array<{
      type: "tag";
      attributes: {
        short_name: string;
        name: string;
      };
    }>;
  };
}



interface BitpandaApiResponse<T> {
  data: T[];
  meta: {
    total_count: number;
    next_cursor?: string;
    page_size: number;
  };
  links?: {
    next?: string;
    self: string;
  };
}

export class BitpandaApiClient implements ApiSyncClient {
  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const response = await this.fetchApi(
        `/trades?page_size=1`,
        apiKey
      );

      return response.ok;
    } catch (error) {
      logger.error({ error }, "[BitpandaApiClient] Connection test failed");
      return false;
    }
  }

  async fetchTransactions(apiKey: string, knownExternalIds?: Set<string>): Promise<ApiSyncResult> {
    const allTransactions: Transaction[] = [];
    let wasIncremental = false;

    const tradesResult = await this.fetchAllTrades(apiKey, knownExternalIds);
    allTransactions.push(...tradesResult.transactions);
    if (tradesResult.stoppedEarly) wasIncremental = true;

    const walletResult = await this.fetchAllWalletTransactions(apiKey, knownExternalIds);
    allTransactions.push(...walletResult.transactions);
    if (walletResult.stoppedEarly) wasIncremental = true;

    logger.info({ 
      tradesCount: tradesResult.transactions.length,
      walletCount: walletResult.transactions.length,
      totalCount: allTransactions.length 
    }, "[BitpandaApiClient] Fetch completed");

    allTransactions.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

    return {
      transactions: allTransactions,
      wasIncremental,
    };
  }

  private async fetchAllTrades(apiKey: string, knownExternalIds?: Set<string>): Promise<FetchResult> {
    const transactions: Transaction[] = [];
    let cursor: string | undefined;
    let stoppedEarly = false;

    do {
      let url = `/trades?page_size=${DEFAULT_PAGE_SIZE}`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const response = await this.fetchApi(url, apiKey);
      if (!response.ok) {
        throw new Error(`Failed to fetch trades: ${response.status}`);
      }

      const data = (await response.json()) as BitpandaApiResponse<BitpandaTrade>;

      logger.info({ 
        total_count: data.meta.total_count, 
        page_size: data.meta.page_size,
        has_next: !!data.meta.next_cursor 
      }, "[BitpandaApiClient] Fetched trades page");

      for (const trade of data.data) {
        if (trade.attributes.status !== "finished") {
          continue;
        }

        if (knownExternalIds && knownExternalIds.has(trade.id)) {
          logger.debug({ id: trade.id }, "[BitpandaApiClient] Found known trade, stopping early");
          stoppedEarly = true;
          break;
        }

        const tx = this.mapTradeToTransaction(trade);
        if (tx) {
          transactions.push(tx);
        }
      }

      if (stoppedEarly) {
        break;
      }

      cursor = data.meta.next_cursor;
    } while (cursor);

    return { transactions, stoppedEarly };
  }

  private async fetchAllWalletTransactions(apiKey: string, knownExternalIds?: Set<string>): Promise<FetchResult> {
    const transactions: Transaction[] = [];
    let cursor: string | undefined;
    let stoppedEarly = false;

    do {
      let url = `/wallets/transactions?page_size=${DEFAULT_PAGE_SIZE}`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const response = await this.fetchApi(url, apiKey);
      if (!response.ok) {
        logger.warn({ status: response.status }, "[BitpandaApiClient] Failed to fetch wallet transactions");
        break;
      }

      const data = (await response.json()) as BitpandaApiResponse<BitpandaWalletTransaction>;

      logger.info({ 
        total_count: data.meta.total_count, 
        page_size: data.meta.page_size,
        has_next: !!data.meta.next_cursor 
      }, "[BitpandaApiClient] Fetched wallet transactions page");

      for (const tx of data.data) {
        if (tx.attributes.status !== "finished") {
          continue;
        }

        if (tx.attributes.trade) {
          logger.debug({ id: tx.id }, "[BitpandaApiClient] Skipping wallet transaction with trade reference");
          continue;
        }

        if (knownExternalIds && knownExternalIds.has(tx.id)) {
          logger.debug({ id: tx.id }, "[BitpandaApiClient] Found known wallet transaction, stopping early");
          stoppedEarly = true;
          break;
        }

        const mapped = this.mapWalletTransactionToTransaction(tx);
        if (mapped) {
          transactions.push(mapped);
        }
      }

      if (stoppedEarly) break;

      cursor = data.meta.next_cursor;
    } while (cursor);

    return { transactions, stoppedEarly };
  }

  private mapTradeToTransaction(trade: BitpandaTrade): Transaction | null {
    const { attributes } = trade;
    const timestamp = DateTime.fromISO(attributes.time.date_iso8601);
    const quantity = parseFloat(attributes.amount_cryptocoin);
    const eurValue = parseFloat(attributes.amount_fiat) * parseFloat(attributes.fiat_to_eur_rate);
    const eurRate = parseFloat(attributes.price);

    const eurFee = attributes.is_swap && attributes.is_fee_transparent === false
      ? 0
      : this.parseFee(attributes.fee);

    if (!attributes.cryptocoin_symbol) {
      logger.warn({ id: trade.id }, "[BitpandaApiClient] Trade missing cryptocoin_symbol, skipping");
      return null;
    }

    if (attributes.cryptocoin_symbol === "BCPEUR" || attributes.fiat_symbol === "BCPEUR") {
      logger.debug({ id: trade.id, symbol: attributes.cryptocoin_symbol }, "[BitpandaApiClient] Skipping BCPEUR trade");
      return null;
    }

    let type: TransactionType;
    if (attributes.type === "buy") {
      type = TransactionType.buy;
    } else if (attributes.type === "sell") {
      type = TransactionType.sell;
    } else if (attributes.type === "staking") {
      type = TransactionType.reward;
    } else {
      logger.debug({ type: attributes.type, id: trade.id }, "[BitpandaApiClient] Skipping unknown trade type");
      return null;
    }

    return {
      id: 0,
      providerAccountId: 0,
      externalId: trade.id,
      timestamp,
      type,
      asset: attributes.cryptocoin_symbol,
      quantity,
      eurValue,
      eurFee,
      eurRate,
      processed: false,
    };
  }

  private parseFee(fee?: string | BitpandaFee): number {
    if (!fee) return 0;
    if (typeof fee === "string") return parseFloat(fee);
    return parseFloat(fee.attributes.fee_amount_in_fiat) || 0;
  }

  private mapWalletTransactionToTransaction(tx: BitpandaWalletTransaction): Transaction | null {
    const { attributes } = tx;
    const timestamp = DateTime.fromISO(attributes.time.date_iso8601);

    const quantity = parseFloat(attributes.amount);
    const eurValue = parseFloat(attributes.amount_eur) || 0;
    const eurFee = parseFloat(attributes.fee) || 0;

    const isStakeTag = attributes.tags?.some(
      (tag) => tag.attributes.short_name === "stake"
    );

    let type: TransactionType;
    if (attributes.type === "deposit") {
      type = TransactionType.deposit;
    } else if (attributes.type === "withdrawal") {
      type = TransactionType.withdrawal;
    } else if (attributes.type === "transfer") {
      if (isStakeTag && attributes.in_or_out === "incoming") {
        type = TransactionType.reward;
      } else {
        logger.debug({ type: attributes.type, id: tx.id }, "[BitpandaApiClient] Skipping internal transfer");
        return null;
      }
    } else {
      logger.debug({ type: attributes.type, id: tx.id }, "[BitpandaApiClient] Skipping unknown wallet transaction type");
      return null;
    }

    return {
      id: 0,
      providerAccountId: 0,
      externalId: tx.id,
      timestamp,
      type,
      asset: attributes.cryptocoin_symbol,
      quantity: Math.abs(quantity),
      eurValue: Math.abs(eurValue),
      eurFee: Math.abs(eurFee),
      eurRate: 0,
      processed: false,
    };
  }

  private async fetchApi(path: string, apiKey: string): Promise<Response> {
    return fetch(`${BITPANDA_API_BASE}${path}`, {
      headers: {
        "X-Api-Key": apiKey,
        "Accept": "application/json",
      },
    });
  }
}
