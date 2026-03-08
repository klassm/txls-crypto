import { describe, it, expect } from "vitest";
import { TransactionType } from "@txls/shared";
import { BitpandaImporter, ImportError } from "./importer.js";

describe("BitpandaImporter", () => {
  const service = new BitpandaImporter();
  const accountId = 1;

  describe("parseCsv", () => {
    it("should parse buy transaction", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,1000,EUR,0.05,BTC,20000,EUR,Cryptocurrency,BTC,5.00,EUR,0.5,0.5,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        providerAccountId: accountId,
        externalId: "T12345",
        type: TransactionType.buy,
        asset: "BTC",
        quantity: 0.05,
        eurValue: 1000,
        eurFee: 5,
        processed: false,
      });
      expect(result.validationErrors).toHaveLength(0);
    });

    it("should parse sell transaction", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T67890,2026-02-19 19:00:00,sell,incoming,500,EUR,0.025,BTC,20000,EUR,Cryptocurrency,BTC,2.50,EUR,0.5,0.5,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        externalId: "T67890",
        type: TransactionType.sell,
        asset: "BTC",
        quantity: 0.025,
        eurValue: 500,
        eurFee: 2.5,
      });
    });

    it("should parse reward transaction", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
1f08817f-db22-662e-8da0-255f38e9fac2,2025-09-02T18:15:07+02:00,reward,incoming,2.12,EUR,0.00057409,ETH,3692.80,EUR,Cryptocurrency,5,-,-,-,-,-`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        externalId: "1f08817f-db22-662e-8da0-255f38e9fac2",
        type: TransactionType.reward,
        asset: "ETH",
        quantity: 0.00057409,
        eurValue: 2.12,
        eurFee: 0,
      });
    });

it("should skip EUR/Fiat deposit transactions", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
F22222,2026-02-19 17:00:00,deposit,incoming,1000,EUR,,EUR,1,EUR,Fiat,EUR,0.00,EUR,0,EUR,EUR,0.00`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip BCPEUR and EUR/Fiat transactions", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
F1f033354-85f9-6dd8-b24d-65da3e3d6b01,2025-05-17T17:40:38+02:00,deposit,incoming,500.00,EUR,-,EUR,-,-,Fiat,-,0.00000000,EUR,-,-,-,0.00
T1f03335a-c6d1-6a80-6ab6-7ab61fdbbc53,2025-05-17T17:43:36+02:00,buy,outgoing,500.00,EUR,231.58354764,BCPEUR,2.16,EUR,Cryptocurrency,BCPEUR,7.53000000,EUR,1.49,-,-,0.00`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip transactions with EUR asset", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
E11111,2026-02-19 20:00:00,deposit,incoming,1000,EUR,1000,EUR,1,EUR,Fiat,EUR,,,,`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip transactions with Fiat asset class", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
E11111,2026-02-19 20:00:00,deposit,incoming,1000,EUR,1000,EUR,1,EUR,Fiat,EUR,,,,`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip metadata rows", () => {
      const csv = `User ID,Some other field
12345,John Doe
Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T99999,2026-02-19 20:00:00,buy,outgoing,500,EUR,0.01,BTC,50000,EUR,Cryptocurrency,BTC,2.50,EUR,0.5,0.5,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].externalId).toBe("T99999");
    });

    it("should handle numbers with commas", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T55555,2026-02-19 20:00:00,buy,outgoing,"1,000.50",EUR,0.03,BTC,"33,335",EUR,Cryptocurrency,BTC,5.00,EUR,0.5,0.5,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].eurValue).toBe(1000.5);
      expect(result.transactions[0].quantity).toBe(0.03);
    });

    it("should return validation errors for unknown transaction type", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,EUR,EUR,0
T77777,2026-02-19 19:00:00,unknown,outgoing,100,EUR,0.001,BTC,100000,EUR,Cryptocurrency,BTC,0.50,EUR,0.5,EUR,EUR,0
T22222,2026-02-19 18:00:00,sell,incoming,50,EUR,0.5,ETH,100,EUR,Cryptocurrency,ETH,0.50,EUR,1,EUR,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(2);
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0]).toContain("T77777");
      expect(result.validationErrors[0]).toContain("Type: unknown");
    });

    it("should handle multiple transactions", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T11111,2026-02-19 20:00:00,buy,outgoing,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,0,EUR,0
T22222,2026-02-19 19:00:00,sell,incoming,50,EUR,0.5,ETH,100,EUR,Cryptocurrency,ETH,0.50,EUR,1,0,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe(TransactionType.buy);
      expect(result.transactions[1].type).toBe(TransactionType.sell);
    });

    it("should throw ImportError for empty CSV", () => {
      const csv = "Transaction ID\n";

      expect(() => service.parseCsv(csv, accountId)).toThrow(ImportError);
      expect(() => service.parseCsv(csv, accountId)).toThrow("CSV file is empty");
    });

    it("should throw ImportError for missing Transaction ID header", () => {
      const csv = `Some Other Header,Timestamp
value,2026-02-19`;

      expect(() => service.parseCsv(csv, accountId)).toThrow(ImportError);
      expect(() => service.parseCsv(csv, accountId)).toThrow("Could not find 'Transaction ID' header");
    });

it("should throw ImportError for no valid transaction data", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat`;

      expect(() => service.parseCsv(csv, accountId)).toThrow("CSV file is empty");
    });

    it("should throw ImportError when all transactions are invalid", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T77777,2026-02-19 20:00:00,unknown,outgoing,100,EUR,0.001,BTC,100000,EUR,Cryptocurrency,BTC,0.50,EUR,0.5,EUR,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0]).toContain("T77777");
      expect(result.validationErrors[0]).toContain("Type: unknown");
    });

    it("should collect validation errors but still return valid transactions", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,0,EUR,0
T77777,2026-02-19 19:00:00,unknown,outgoing,100,EUR,0.001,BTC,100000,EUR,Cryptocurrency,BTC,0.50,EUR,0.5,0.5,EUR,0
T22222,2026-02-19 18:00:00,sell,incoming,50,EUR,0.5,ETH,100,EUR,Cryptocurrency,ETH,0.50,EUR,1,0,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(2);
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0]).toContain("T77777");
    });

    it("should parse transfer_out transaction", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,EUR,EUR,0
13333,2026-02-19 16:00:00,transfer,outgoing,100,EUR,0.1,SOL,1000,EUR,Cryptocurrency,SOL,0.00,EUR,0,EUR,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[1].type).toBe(TransactionType.transfer_out);
      expect(result.transactions[1].asset).toBe("SOL");
      expect(result.transactions[1].quantity).toBeCloseTo(0.1, 5);
      expect(result.validationErrors).toHaveLength(0);
    });

    it("should parse transfer_in transaction", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
13333,2026-02-19 16:00:00,transfer,incoming,100,EUR,0.1,SOL,1000,EUR,Cryptocurrency,SOL,0.00,EUR,0,EUR,EUR,0`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe(TransactionType.transfer_in);
      expect(result.transactions[0].asset).toBe("SOL");
    });

    it("should skip transfer(stake) and transfer(unstake) transactions", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
1f051f57-0835-6d20-bd6d-d58cbac8c087,2025-06-25T20:51:44+02:00,transfer(stake),incoming,2436.76,EUR,19.77595407,SOL,123.22,EUR,Cryptocurrency,135,-,-,-,-,-
1f099999-0835-6d20-bd6d-d58cbac8c088,2025-06-26T10:00:00+02:00,transfer(unstake),incoming,2500,EUR,20,SOL,125,EUR,Cryptocurrency,135,-,-,-,-,-`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });
  });

  describe("mapTransactionType", () => {
    it("should map buy to TransactionType.buy", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,0,EUR,0`;
      const transactions = service.parseCsv(csv, accountId);
      expect(transactions.transactions[0].type).toBe(TransactionType.buy);
    });

    it("should map sell to TransactionType.sell", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,sell,incoming,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,0,EUR,0`;
      const transactions = service.parseCsv(csv, accountId);
      expect(transactions.transactions[0].type).toBe(TransactionType.sell);
    });

    it("should skip EUR/Fiat deposits", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
F12345,2026-02-19 20:00:00,deposit,incoming,100,EUR,,EUR,1,EUR,Fiat,EUR,0.00,EUR,0,EUR,EUR,0.00`;
      const transactions = service.parseCsv(csv, accountId);
      expect(transactions.transactions).toHaveLength(0);
    });

    it("should map reward to TransactionType.reward", () => {
      const csv = `Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
11111,2026-02-19 18:00:00,reward,incoming,,EUR,0.1,SOL,100,EUR,Cryptocurrency,SOL,,EUR,0,0,EUR,0`;
      const transactions = service.parseCsv(csv, accountId);
      expect(transactions.transactions[0].type).toBe(TransactionType.reward);
    });
  });

  describe("isMetadataRow", () => {
    it('should skip metadata rows with "User" in transaction ID', () => {
      const csv = `User ID,Some other field
12345,John Doe
Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Asset market price currency,Asset class,Product ID,Fee,Fee asset,Fee percent,Spread,Spread Currency,Tax Fiat
T12345,2026-02-19 20:00:00,buy,outgoing,100,EUR,1,ETH,100,EUR,Cryptocurrency,ETH,1.00,EUR,1,0,EUR,0`;
      const transactions = service.parseCsv(csv, accountId);
      expect(transactions.transactions).toHaveLength(1);
      expect(transactions.transactions[0].externalId).not.toContain("User");
    });
  });
});