import nock from "nock";

const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";

export interface MockTrade {
  id: string;
  type: "buy" | "sell";
  asset: string;
  amount: string;
  fiatAmount: string;
  price: string;
  timestamp: string;
  status?: string;
}

export interface MockTransaction {
  id: string;
  type: string;
  asset: string;
  amount: string;
  eurValue: string;
  timestamp: string;
  status?: string;
}

export function mockBitpandaApi() {
  const scopes: nock.Scope[] = [];

  return {
    mockSuccess(apiKey: string) {
      const scope = nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 1 })
        .matchHeader("X-Api-Key", apiKey)
        .reply(200, { data: [], meta: { total_count: 0, page_size: 1 } });
      scopes.push(scope);
      return scope;
    },

    mockInvalidApiKey() {
      const scope = nock(BITPANDA_API_BASE)
        .get(/.*/)
        .reply(401, { error: "Unauthorized" });
      scopes.push(scope);
      return scope;
    },

    mockTrades(apiKey: string, trades: MockTrade[], nextCursor?: string) {
      const data = trades.map((t) => ({
        id: t.id,
        type: "trade",
        attributes: {
          status: t.status || "finished",
          type: t.type,
          cryptocoin_symbol: t.asset,
          cryptocoin_id: "1",
          fiat_id: "1",
          fiat_symbol: "EUR",
          amount_fiat: t.fiatAmount,
          amount_cryptocoin: t.amount,
          fiat_to_eur_rate: "1.0",
          time: { date_iso8601: t.timestamp, unix: "0" },
          price: t.price,
          is_swap: false,
        },
      }));

      const scope = nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .matchHeader("X-Api-Key", apiKey)
        .reply(200, {
          data,
          meta: { total_count: data.length, page_size: 100, next_cursor: nextCursor },
        });
      scopes.push(scope);
      return scope;
    },

    mockCryptoTransactions(apiKey: string, transactions: MockTransaction[]) {
      const scope = nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ type: "deposit", page_size: 100 })
        .matchHeader("X-Api-Key", apiKey)
        .reply(200, {
          data: transactions
            .filter((t) => t.type === "deposit")
            .map((t) => ({
              id: t.id,
              type: "transaction",
              attributes: {
                amount: t.amount,
                time: { date_iso8601: t.timestamp },
                type: "deposit",
                status: t.status || "finished",
                amount_eur: t.eurValue,
                cryptocoin_symbol: t.asset,
                fee: "0",
              },
            })),
          meta: { total_count: 0, page_size: 100 },
        });

      nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ type: "withdrawal", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ type: "transfer", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      scopes.push(scope);
      return scope;
    },

    mockAllEndpoints(apiKey: string, options?: { trades?: MockTrade[] }) {
      this.mockTrades(apiKey, options?.trades || []);
      this.mockCryptoTransactions(apiKey, []);

      nock(BITPANDA_API_BASE)
        .get("/fiatwallets/transactions")
        .query({ type: "deposit", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/fiatwallets/transactions")
        .query({ type: "withdrawal", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/assets/transactions/commodity")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
    },

    cleanAll() {
      scopes.forEach((s) => s.persist(false));
      nock.cleanAll();
    },
  };
}
