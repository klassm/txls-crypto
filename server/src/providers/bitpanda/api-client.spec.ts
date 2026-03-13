import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import nock from "nock";
import { BitpandaApiClient } from "./api-client.js";
import { TransactionType } from "@txls/shared";

const API_KEY = "test-api-key-12345";
const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";

function mockWalletEndpoints() {
  nock(BITPANDA_API_BASE)
    .get("/wallets/transactions")
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

      mockWalletEndpoints();

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

    it("should handle new fee object format", async () => {
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
                amount_fiat: "5000.00",
                amount_cryptocoin: "0.06124219",
                fiat_to_eur_rate: "1.0",
                time: {
                  date_iso8601: "2024-01-15T10:00:00+01:00",
                  unix: "1705311600",
                },
                price: "81643.05",
                is_swap: false,
                fee: {
                  type: "fee",
                  attributes: {
                    fee_amount_in_fiat: "49.75",
                  },
                },
              },
            },
          ],
          meta: { total_count: 1, page_size: 100 },
        });

      mockWalletEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].eurFee).toBe(49.75);
    });

    it("should import both sides of swap with fee on transparent side", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "swap-buy",
              type: "trade",
              attributes: {
                status: "finished",
                type: "buy",
                cryptocoin_symbol: "BTC",
                amount_fiat: "5000.00",
                amount_cryptocoin: "0.06124219",
                fiat_to_eur_rate: "1.0",
                time: {
                  date_iso8601: "2024-01-15T10:00:00+01:00",
                  unix: "1705311600",
                },
                price: "81643.05",
                is_swap: true,
                is_fee_transparent: true,
                fee: {
                  type: "fee",
                  attributes: {
                    fee_amount_in_fiat: "49.75",
                  },
                },
              },
            },
            {
              id: "swap-sell",
              type: "trade",
              attributes: {
                status: "finished",
                type: "sell",
                cryptocoin_symbol: "BCPEUR",
                amount_fiat: "5000.00",
                amount_cryptocoin: "5000.00",
                fiat_to_eur_rate: "1.0",
                time: {
                  date_iso8601: "2024-01-15T10:00:00+01:00",
                  unix: "1705311600",
                },
                price: "1.00",
                is_swap: true,
                is_fee_transparent: false,
              },
            },
          ],
          meta: { total_count: 2, page_size: 100 },
        });

      mockWalletEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(1);
      const buyTx = result.transactions.find((t) => t.externalId === "swap-buy");
      expect(buyTx).toBeDefined();
      expect(buyTx?.type).toBe(TransactionType.buy);
      expect(buyTx?.asset).toBe("BTC");
      expect(buyTx?.eurFee).toBe(49.75);
    });

    it("should include swap trades with fee transparency", async () => {
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

      mockWalletEndpoints();

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip stake/unstake transfers and regular transfers", async () => {
      nock(BITPANDA_API_BASE)
        .get("/trades")
        .query({ page_size: 100 })
        .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

      nock(BITPANDA_API_BASE)
        .get("/wallets/transactions")
        .query({ page_size: 100 })
        .reply(200, {
          data: [
            {
              id: "wallet-unstake-1",
              type: "wallet_transaction",
              attributes: {
                amount: "1.84379034",
                time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                in_or_out: "incoming",
                type: "transfer",
                status: "finished",
                amount_eur: "4871.40",
                cryptocoin_symbol: "ETH",
                fee: "0",
                tags: [
                  {
                    type: "tag",
                    attributes: {
                      short_name: "stake",
                      name: "Stake",
                    },
                  },
                ],
              },
            },
            {
              id: "wallet-stake-1",
              type: "wallet_transaction",
              attributes: {
                amount: "2.0",
                time: { date_iso8601: "2024-01-14T10:00:00+01:00" },
                in_or_out: "outgoing",
                type: "transfer",
                status: "finished",
                amount_eur: "5287.40",
                cryptocoin_symbol: "ETH",
                fee: "0",
                tags: [
                  {
                    type: "tag",
                    attributes: {
                      short_name: "stake",
                      name: "Stake",
                    },
                  },
                ],
              },
            },
            {
              id: "wallet-transfer-1",
              type: "wallet_transaction",
              attributes: {
                amount: "0.5",
                time: { date_iso8601: "2024-01-13T10:00:00+01:00" },
                in_or_out: "incoming",
                type: "transfer",
                status: "finished",
                amount_eur: "20000",
                cryptocoin_symbol: "BTC",
                fee: "0",
                tags: [],
              },
            },
            {
              id: "wallet-deposit-1",
              type: "wallet_transaction",
              attributes: {
                amount: "0.1",
                time: { date_iso8601: "2024-01-12T10:00:00+01:00" },
                in_or_out: "incoming",
                type: "deposit",
                status: "finished",
                amount_eur: "5000.00",
                cryptocoin_symbol: "BTC",
                fee: "0",
                tags: [],
              },
            },
            {
              id: "wallet-buy-duplicate",
              type: "wallet_transaction",
              attributes: {
                amount: "0.06124219",
                time: { date_iso8601: "2024-01-11T10:00:00+01:00" },
                in_or_out: "incoming",
                type: "buy",
                status: "finished",
                amount_eur: "5000.00",
                cryptocoin_symbol: "BTC",
                fee: "0",
                trade: { id: "trade-123" },
                tags: [],
              },
            },
          ],
          meta: { total_count: 5, page_size: 100 },
        });

      const result = await client.fetchTransactions(API_KEY);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe(TransactionType.deposit);
      expect(result.transactions[0].asset).toBe("BTC");
      expect(result.transactions[0].quantity).toBe(0.1);
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

      mockWalletEndpoints();

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

      mockWalletEndpoints();

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

        mockWalletEndpoints();

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

        mockWalletEndpoints();

        const result = await client.fetchTransactions(API_KEY);

        expect(result.transactions).toHaveLength(1);
        expect(result.wasIncremental).toBe(false);
      });

      it("should stop early in wallet transactions", async () => {
        nock(BITPANDA_API_BASE)
          .get("/trades")
          .query({ page_size: 100 })
          .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

        nock(BITPANDA_API_BASE)
          .get("/wallets/transactions")
          .query({ page_size: 100 })
          .reply(200, {
            data: [
              {
                id: "wallet-new",
                type: "wallet_transaction",
                attributes: {
                  amount: "0.5",
                  time: { date_iso8601: "2024-01-20T10:00:00+01:00" },
                  in_or_out: "incoming",
                  type: "deposit",
                  status: "finished",
                  amount_eur: "20000",
                  cryptocoin_symbol: "BTC",
                  fee: "0",
                  tags: [],
                },
              },
              {
                id: "wallet-known",
                type: "wallet_transaction",
                attributes: {
                  amount: "0.3",
                  time: { date_iso8601: "2024-01-15T10:00:00+01:00" },
                  in_or_out: "incoming",
                  type: "deposit",
                  status: "finished",
                  amount_eur: "12000",
                  cryptocoin_symbol: "BTC",
                  fee: "0",
                  tags: [],
                },
              },
            ],
            meta: { total_count: 5, page_size: 100 },
          });

        const knownIds = new Set(["wallet-known"]);
        const result = await client.fetchTransactions(API_KEY, knownIds);

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].externalId).toBe("wallet-new");
        expect(result.wasIncremental).toBe(true);
      });
    });
  });
});
