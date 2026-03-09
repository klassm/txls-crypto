import { DateTime } from "luxon";
import type { Transaction } from "@txls/shared";
import { TransactionType } from "@txls/shared";
import type { ApiSyncClient, ApiSyncResult } from "../types.js";
import { logger } from "../../common/logger.js";

const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";
const DEFAULT_PAGE_SIZE = 100;

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
    fee?: string;
  };
}

interface BitpandaCryptoTransaction {
  id: string;
  type: "transaction";
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
    related_wallet_transaction_id?: string;
  };
}

interface BitpandaFiatTransaction {
  id: string;
  type: "fiat_wallet_transaction";
  attributes: {
    fiat_wallet_id: string;
    user_id: string;
    fiat_id: string;
    fiat_symbol: string;
    amount: string;
    fee: string;
    to_eur_rate: string;
    time: {
      date_iso8601: string;
      unix: string;
    };
    in_or_out: "incoming" | "outgoing";
    type: string;
    status: string;
  };
}

interface BitpandaCommodityTransaction {
  id: string;
  type: "transaction";
  attributes: {
    amount: string;
    time: {
      date_iso8601: string;
      unix: string;
    };
    in_or_out: "incoming" | "outgoing";
    type: string;
    status: string;
    amount_eur: string;
    cryptocoin_id: string;
    cryptocoin_symbol: string;
    fee: string;
    trade?: {
      id: string;
      attributes: {
        type: "buy" | "sell";
        amount_fiat: string;
        amount_cryptocoin: string;
        price: string;
      };
    };
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

  async fetchTransactions(apiKey: string): Promise<ApiSyncResult> {
    const allTransactions: Transaction[] = [];

    const trades = await this.fetchAllTrades(apiKey);
    allTransactions.push(...trades);

    const crypto = await this.fetchAllCryptoTransactions(apiKey);
    allTransactions.push(...crypto);

    const fiat = await this.fetchAllFiatTransactions(apiKey);
    allTransactions.push(...fiat);

    const commodity = await this.fetchAllCommodityTransactions(apiKey);
    allTransactions.push(...commodity);

    allTransactions.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

    return {
      transactions: allTransactions,
    };
  }

  private async fetchAllTrades(apiKey: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    let cursor: string | undefined;

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

      for (const trade of data.data) {
        if (trade.attributes.status !== "finished") {
          continue;
        }

        const tx = this.mapTradeToTransaction(trade);
        if (tx) {
          transactions.push(tx);
        }
      }

      cursor = data.meta.next_cursor;
    } while (cursor);

    return transactions;
  }

  private async fetchAllCryptoTransactions(apiKey: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];

    const txTypes = ["deposit", "withdrawal", "transfer"];

    for (const txType of txTypes) {
      let cursor: string | undefined;

      do {
        let url = `/wallets/transactions?type=${txType}&page_size=${DEFAULT_PAGE_SIZE}`;
        if (cursor) {
          url += `&cursor=${cursor}`;
        }

        const response = await this.fetchApi(url, apiKey);
        if (!response.ok) {
          logger.warn({ status: response.status, type: txType }, "[BitpandaApiClient] Failed to fetch crypto transactions");
          break;
        }

        const data = (await response.json()) as BitpandaApiResponse<BitpandaCryptoTransaction>;

        for (const tx of data.data) {
          if (tx.attributes.status !== "finished") {
            continue;
          }

          const mapped = this.mapCryptoTransactionToTransaction(tx);
          if (mapped) {
            transactions.push(mapped);
          }
        }

        cursor = data.meta.next_cursor;
      } while (cursor);
    }

    return transactions;
  }

  private async fetchAllFiatTransactions(apiKey: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];

    const txTypes = ["deposit", "withdrawal", "transfer"];

    for (const txType of txTypes) {
      let cursor: string | undefined;

      do {
        let url = `/fiatwallets/transactions?type=${txType}&page_size=${DEFAULT_PAGE_SIZE}`;
        if (cursor) {
          url += `&cursor=${cursor}`;
        }

        const response = await this.fetchApi(url, apiKey);
        if (!response.ok) {
          logger.warn({ status: response.status, type: txType }, "[BitpandaApiClient] Failed to fetch fiat transactions");
          break;
        }

        const data = (await response.json()) as BitpandaApiResponse<BitpandaFiatTransaction>;

        for (const tx of data.data) {
          if (tx.attributes.status !== "finished") {
            continue;
          }

          const mapped = this.mapFiatTransactionToTransaction(tx);
          if (mapped) {
            transactions.push(mapped);
          }
        }

        cursor = data.meta.next_cursor;
      } while (cursor);
    }

    return transactions;
  }

  private async fetchAllCommodityTransactions(apiKey: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    let cursor: string | undefined;

    do {
      let url = `/assets/transactions/commodity?page_size=${DEFAULT_PAGE_SIZE}`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const response = await this.fetchApi(url, apiKey);
      if (!response.ok) {
        logger.warn({ status: response.status }, "[BitpandaApiClient] Failed to fetch commodity transactions");
        break;
      }

      const data = (await response.json()) as BitpandaApiResponse<BitpandaCommodityTransaction>;

      for (const tx of data.data) {
        if (tx.attributes.status !== "finished") {
          continue;
        }

        const mapped = this.mapCommodityTransactionToTransaction(tx);
        if (mapped) {
          transactions.push(mapped);
        }
      }

      cursor = data.meta.next_cursor;
    } while (cursor);

    return transactions;
  }

  private mapTradeToTransaction(trade: BitpandaTrade): Transaction | null {
    const { attributes } = trade;
    const timestamp = DateTime.fromISO(attributes.time.date_iso8601);

    const quantity = parseFloat(attributes.amount_cryptocoin);
    const eurValue = parseFloat(attributes.amount_fiat) * parseFloat(attributes.fiat_to_eur_rate);
    const eurRate = parseFloat(attributes.price);
    const eurFee = attributes.fee ? parseFloat(attributes.fee) : 0;

    if (!attributes.cryptocoin_symbol) {
      logger.warn({ id: trade.id }, "[BitpandaApiClient] Trade missing cryptocoin_symbol, skipping");
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

  private mapCryptoTransactionToTransaction(tx: BitpandaCryptoTransaction): Transaction | null {
    const { attributes } = tx;
    const timestamp = DateTime.fromISO(attributes.time.date_iso8601);

    const quantity = parseFloat(attributes.amount);
    const eurValue = parseFloat(attributes.amount_eur) || 0;
    const eurFee = parseFloat(attributes.fee) || 0;

    let type: TransactionType;
    if (attributes.type === "deposit") {
      type = TransactionType.deposit;
    } else if (attributes.type === "withdrawal") {
      type = TransactionType.transfer_out;
    } else if (attributes.type === "transfer") {
      type = attributes.in_or_out === "incoming" ? TransactionType.transfer_in : TransactionType.transfer_out;
    } else {
      logger.debug({ type: attributes.type, id: tx.id }, "[BitpandaApiClient] Skipping unknown crypto transaction type");
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

  private mapFiatTransactionToTransaction(tx: BitpandaFiatTransaction): Transaction | null {
    const { attributes } = tx;
    const timestamp = DateTime.fromISO(attributes.time.date_iso8601);

    const quantity = parseFloat(attributes.amount);
    const eurValue = quantity * parseFloat(attributes.to_eur_rate);
    const eurFee = parseFloat(attributes.fee) || 0;

    const isDeposit = attributes.type === "deposit" || 
      (attributes.type === "transfer" && attributes.in_or_out === "incoming");

    return {
      id: 0,
      providerAccountId: 0,
      externalId: tx.id,
      timestamp,
      type: isDeposit ? TransactionType.deposit : TransactionType.transfer_out,
      asset: attributes.fiat_symbol,
      quantity: Math.abs(eurValue),
      eurValue: Math.abs(eurValue),
      eurFee: Math.abs(eurFee),
      eurRate: parseFloat(attributes.to_eur_rate),
      processed: false,
    };
  }

  private mapCommodityTransactionToTransaction(tx: BitpandaCommodityTransaction): Transaction | null {
    const { attributes } = tx;
    const timestamp = DateTime.fromISO(attributes.time.date_iso8601);

    const quantity = parseFloat(attributes.amount);
    const eurValue = parseFloat(attributes.amount_eur) || 0;
    const eurFee = parseFloat(attributes.fee) || 0;
    const eurRate = attributes.trade ? parseFloat(attributes.trade.attributes.price) : 0;

    const type = attributes.type === "buy" ? TransactionType.buy : TransactionType.sell;

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
      eurRate,
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
