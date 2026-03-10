import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import nock from "nock";
import { BitpandaApiClient } from "./api-client.js";
import { TransactionType } from "@txls/shared";

const API_KEY = "test-api-key-12345";
const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";

function mockAllNonTradeEndpoints() {
  for (const txType of ["deposit", "withdrawal", "transfer"]) {
    nock(BITPANDA_API_BASE)
      .get("/wallets/transactions")
      .query({ type: txType, page_size: 100 })
      .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
  }

  for (const txType of ["deposit", "withdrawal", "transfer"]) {
    nock(BITPANDA_API_BASE)
      .get("/fiatwallets/transactions")
      .query({ type: txType, page_size: 100 })
      .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
  }

  nock(BITPANDA_API_BASE)
    .get("/assets/transactions/commodity")
    .query({ page_size: 100 })
    .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
}

describe("BitpandaApiClient", () => {
  let client: BitpandaApiClient;

  beforeAll(() => {
    client = new BitpandaApiClient();
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("testConnection", () => {
    it("should return true for valid API key", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 1 })
        .matchHeader("X-Api-Key", API_KEY)
        .reply(200, {
          data: [],
          meta: { total_count: 0, page_size: 1 },
        });

      const result = await client.testConnection(API_KEY);
      expect(result).toBe(true);
    });

    it("should return false for invalid API key (401)", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 1 })
        .reply(401, { error: "Unauthorized" });

      const result = await client.testConnection(API_KEY);
      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 1 })
        .replyWithError("Network error");

      const result = await client.testConnection(API_KEY);
      expect(result).toBe(false);
    });
  });

  describe("fetchTransactions", () => {
    it("should fetch and map trades correctly", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "trade-1",
              type: "trade",
              attributes: {
                status: "finished",
                type: "buy",
                cryptocoin_id: "1",
                cryptocoin_symbol: "BTC",
                fiat_id: "1",
                fiat_symbol: "EUR",
                amount_fiat: "1000.00",
                amount_cryptocoin: "0.05",
                fiat_to_eur_rate: "1.0",
                time: {
                  date_iso8601: "2024-01-15T10:00:00+01:00",
                  unix: "1705311600",
                },
                price: "20000.00",
                is_swap: false,
              },
            },
            {
              id: "trade-2",
              type: "trade",
              attributes: {
                status: "finished",
                type: "sell",
                cryptocoin_id: "3",
                cryptocoin_symbol: "ETH",
                fiat_id: "1",
                fiat_symbol: "EUR",
                amount_fiat: "500.00",
                amount_cryptocoin: "0.25",
                fiat_to_eur_rate: "1.0",
                time: {
                  date_iso8601: "2024-01-16T14:30:00+01:00",
                  unix: "1705414200",
                },
                price: "2000.00",
                is_swap: false,
                fee: "1.50",
              },
            },
          ],
          meta: { total_count: 2, page_size: 100 },
        });

      mockAllNonTradeEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(2);

      const buyTx = result.transactions.find((t) => t.externalId === "trade-1");
      expect(buyTx).toBeDefined();
      expect(buyTx?.type).toBe(TransactionType.buy);
      expect(buyTx?.asset).toBe("BTC");
      expect(buyTx?.quantity).toBe(0.05);
      expect(buyTx?.eurValue).toBe(1000);
      expect(buyTx?.eurRate).toBe(20000);

      const sellTx = result.transactions.find((t) => t.externalId === "trade-2");
      expect(sellTx).toBeDefined();
      expect(sellTx?.type).toBe(TransactionType.sell);
      expect(sellTx?.asset).toBe("ETH");
      expect(sellTx?.eurFee).toBe(1.5);
    });

    it("should skip non-finished trades", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "trade-pending",
              type: "trade",
              attributes: {
                status: "pending",
                type: "buy",
                cryptocoin_symbol: "BTC",
                amount_fiat: "100",
                amount_cryptocoin: "0.01",
                fiat_to_eur_rate: "1.0",
                time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                price: "10000",
                is_swap: false,
              },
            },
          ],
          meta: { total_count: 1, page_size: 100 },
        });

      mockAllNonTradeEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(0);
    });

    it("should fetch crypto deposits and withdrawals", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ type: "deposit", page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "crypto-deposit-1",
              type: "transaction",
              attributes: {
                amount: "0.5",
                time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                in_or_out: "incoming",
                type: "deposit",
                status: "finished",
                amount_eur: "20000",
                cryptocoin_symbol: "BTC",
                fee: "0",
              },
            },
          ],
          meta: { total_count: 1, page_size: 100 },
        });

      nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ type: "withdrawal", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ type: "transfer", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      for (const txType of ["deposit", "withdrawal", "transfer"]) {
        nock(BITPANDA_API_BASE)
          .get("/fiatwallets/transactions")
          .query({ type: txType, page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
      }

      nock(BITPANDA_API_BASE)
        .get("/assets/transactions/commodity")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe(TransactionType.deposit);
      expect(result.transactions[0].asset).toBe("BTC");
      expect(result.transactions[0].quantity).toBe(0.5);
    });

    it("should fetch fiat deposits", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      for (const txType of ["deposit", "withdrawal", "transfer"]) {
        nock(BITPANDA_API_BASE)
          .get("/wallets/transactions")
          .query({ type: txType, page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
      }

      nock(BITPANDA_API_BASE)
        .get("/fiatwallets/transactions")
        .query({ type: "deposit", page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "fiat-deposit-1",
              type: "fiat_wallet_transaction",
              attributes: {
                fiat_symbol: "EUR",
                amount: "1000.00",
                fee: "0",
                to_eur_rate: "1.0",
                time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                type: "deposit",
                status: "finished",
              },
            },
          ],
          meta: { total_count: 1, page_size: 100 },
        });

      nock(BITPANDA_API_BASE)
        .get("/fiatwallets/transactions")
        .query({ type: "withdrawal", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/fiatwallets/transactions")
        .query({ type: "transfer", page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/assets/transactions/commodity")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe(TransactionType.deposit);
      expect(result.transactions[0].asset).toBe("EUR");
      expect(result.transactions[0].quantity).toBe(1000);
    });

    it("should fetch commodity transactions (gold/silver)", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      for (const txType of ["deposit", "withdrawal", "transfer"]) {
        nock(BITPANDA_API_BASE)
          .get("/wallets/transactions")
          .query({ type: txType, page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
      }

      for (const txType of ["deposit", "withdrawal", "transfer"]) {
        nock(BITPANDA_API_BASE)
          .get("/fiatwallets/transactions")
          .query({ type: txType, page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
      }

      nock(BITPANDA_API_BASE)
        .get("/assets/transactions/commodity")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "commodity-1",
              type: "transaction",
              attributes: {
                amount: "0.5",
                time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                in_or_out: "incoming",
                type: "buy",
                status: "finished",
                amount_eur: "1000.00",
                cryptocoin_symbol: "XAU",
                fee: "0",
                trade: {
                  id: "trade-1",
                  attributes: {
                    type: "buy",
                    price: "2000.00",
                  },
                },
              },
            },
          ],
          meta: { total_count: 1, page_size: 100 },
        });

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe(TransactionType.buy);
      expect(result.transactions[0].asset).toBe("XAU");
      expect(result.transactions[0].eurRate).toBe(2000);
    });

    it("should fetch all pages until no cursor", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "trade-1",
              type: "trade",
              attributes: {
                status: "finished",
                type: "buy",
                cryptocoin_symbol: "BTC",
                amount_fiat: "100",
                amount_cryptocoin: "0.01",
                fiat_to_eur_rate: "1.0",
                time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                price: "10000",
                is_swap: false,
              },
            },
          ],
          meta: {
            total_count: 2,
            page_size: 100,
            next_cursor: "page-2-cursor",
          },
        });

      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100, cursor: "page-2-cursor" })
        .reply(200, {
          data: [
            {
              id: "trade-2",
              type: "trade",
              attributes: {
                status: "finished",
                type: "buy",
                cryptocoin_symbol: "ETH",
                amount_fiat: "50",
                amount_cryptocoin: "0.5",
                fiat_to_eur_rate: "1.0",
                time: { date_iso8601: "2024-01-14T10:00:00+01:00" },
                price: "2000",
                is_swap: false,
              },
            },
          ],
          meta: {
            total_count: 2,
            page_size: 100,
          },
        });

      mockAllNonTradeEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(2);
    });

    it("should throw error on API failure", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(401, { error: "Unauthorized" });

      await expect(client.fetchTransactions(API_KEY)).rejects.toThrow(
        "Failed to fetch trades: 401"
      );
    });

    it("should sort transactions by timestamp descending", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "trade-1",
              type: "trade",
              attributes: {
                status: "finished",
                type: "buy",
                cryptocoin_symbol: "BTC",
                amount_fiat: "100",
                amount_cryptocoin: "0.01",
                fiat_to_eur_rate: "1.0",
                time: { date_iso8601: "2024-01-10T10:00:00+01:00" },
                price: "10000",
                is_swap: false,
              },
            },
            {
              id: "trade-2",
              type: "trade",
              attributes: {
                status: "finished",
                type: "buy",
                cryptocoin_symbol: "ETH",
                amount_fiat: "100",
                amount_cryptocoin: "0.1",
                fiat_to_eur_rate: "1.0",
                time: { date_iso8601: "2024-01-20T10:00:00+01:00" },
                price: "1000",
                is_swap: false,
              },
            },
          ],
          meta: { total_count: 2, page_size: 100 },
        });

      mockAllNonTradeEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions[0].externalId).toBe("trade-2");
      expect(result.transactions[1].externalId).toBe("trade-1");
    });

    describe("incremental sync", () => {
      it("should stop early when known ID is found in trades", async () => {
        nock(BITPANDA_API_BASE)
          .get("/trades")
          .query({ page_size: 100 })
          .reply(200, {
            data: [
              {
                id: "trade-new",
                type: "trade",
                attributes: {
                  status: "finished",
                  type: "buy",
                  cryptocoin_symbol: "BTC",
                  amount_fiat: "100",
                  amount_cryptocoin: "0.01",
                  fiat_to_eur_rate: "1.0",
                  time: { date_iso8601: "2024-01-20T10:00:00+01:00" },
                  price: "10000",
                  is_swap: false,
                },
              },
              {
                id: "trade-known",
                type: "trade",
                attributes: {
                  status: "finished",
                  type: "buy",
                  cryptocoin_symbol: "ETH",
                  amount_fiat: "50",
                  amount_cryptocoin: "0.5",
                  fiat_to_eur_rate: "1.0",
                  time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                  price: "2000",
                  is_swap: false,
                },
              },
            ],
            meta: { total_count: 10, page_size: 100, next_cursor: "more-data" },
          });

        mockAllNonTradeEndpoints();

        const knownIds = new Set(["trade-known"]);
        const result = await client.fetchTransactions(API_KEY, knownIds);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].externalId).toBe("trade-new");
        expect(result.wasIncremental).toBe(true);
      });

      it("should fetch all when no known IDs provided", async () => {
        nock(BITPANDA_API_BASE)
          .get("/trades")
          .query({ page_size: 100 })
          .reply(200, {
            data: [
              {
                id: "trade-1",
                type: "trade",
                attributes: {
                  status: "finished",
                  type: "buy",
                  cryptocoin_symbol: "BTC",
                  amount_fiat: "100",
                  amount_cryptocoin: "0.01",
                  fiat_to_eur_rate: "1.0",
                  time: { date_iso8601: "2024-01-20T10:00:00+01:00" },
                  price: "10000",
                  is_swap: false,
                },
              },
            ],
            meta: { total_count: 1, page_size: 100 },
          });

        mockAllNonTradeEndpoints();

        const result = await client.fetchTransactions(API_KEY);

        expect(result.transactions).toHaveLength(1);
        expect(result.wasIncremental).toBe(false);
      });

      it("should stop early in crypto transactions", async () => {
        nock(BITPANDA_API_BASE)
          .get("/trades")
          .query({ page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

        nock(BITPANDA_API_BASE)
          .get("/wallets/transactions")
          .query({ type: "deposit", page_size: 100 })
          .reply(200, {
            data: [
              {
                id: "crypto-new",
                type: "transaction",
                attributes: {
                  amount: "0.5",
                  time: { date_iso8601: "2024-01-20T10:00:00+01:00" },
                  in_or_out: "incoming",
                  type: "deposit",
                  status: "finished",
                  amount_eur: "20000",
                  cryptocoin_symbol: "BTC",
                  fee: "0",
                },
              },
              {
                id: "crypto-known",
                type: "transaction",
                attributes: {
                  amount: "0.3",
                  time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                  in_or_out: "incoming",
                  type: "deposit",
                  status: "finished",
                  amount_eur: "12000",
                  cryptocoin_symbol: "BTC",
                  fee: "0",
                },
              },
            ],
            meta: { total_count: 5, page_size: 100 },
          });

        for (const txType of ["withdrawal", "transfer"]) {
          nock(BITPANDA_API_BASE)
            .get("/wallets/transactions")
            .query({ type: txType, page_size: 100 })
            .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
        }

        for (const txType of ["deposit", "withdrawal", "transfer"]) {
          nock(BITPANDA_API_BASE)
            .get("/fiatwallets/transactions")
            .query({ type: txType, page_size: 100 })
            .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });
        }

        nock(BITPANDA_API_BASE)
          .get("/assets/transactions/commodity")
          .query({ page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

        const knownIds = new Set(["crypto-known"]);
        const result = await client.fetchTransactions(API_KEY, knownIds);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].externalId).toBe("crypto-new");
        expect(result.wasIncremental).toBe(true);
      });
    });
  });
});
