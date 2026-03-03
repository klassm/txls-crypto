import { describe, it, expect } from "vitest";
import { TransactionType } from "../../../types";
import { TradeRepublicImporter, ImportError } from "./importer.js";

describe("TradeRepublicImporter", () => {
  const service = new TradeRepublicImporter();
  const accountId = 1;

  describe("parseCsv", () => {
    it("should parse Bitcoin buy transaction", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-05T09:30:22;Buy;-1000.96;Bitcoin;XF000BTC0017;0.010376;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        providerAccountId: accountId,
        type: TransactionType.buy,
        asset: "BTC",
        quantity: 0.010376,
        eurValue: 1000.96,
        eurFee: 1.0,
        processed: false,
      });
      expect(result.validationErrors).toHaveLength(0);
    });

    it("should parse Bitcoin sell transaction", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-07-16T19:17:36;Sell;9760.18;Bitcoin;XF000BTC0017;0.05;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        type: TransactionType.sell,
        asset: "BTC",
        quantity: 0.05,
        eurValue: 9760.18,
        eurFee: 1.0,
      });
    });

    it("should parse XRP buy transaction", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-17T14:53:49;Buy;-501.07;XRP;XF000XRP0018;156.327675;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        type: TransactionType.buy,
        asset: "XRP",
        quantity: 156.327675,
        eurValue: 501.07,
        eurFee: 1.0,
      });
    });

    it("should parse Solana buy transaction", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-04-26T07:43:05;Buy;-2501.05;Solana;XF000SOL0012;18.207109;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        type: TransactionType.buy,
        asset: "SOL",
        quantity: 18.207109,
        eurValue: 2501.05,
        eurFee: 1.0,
      });
    });

    it("should parse Bitcoin reward/staking deposit", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-06-02T08:10:32;Deposit;12.48;Bitcoin;;;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        type: TransactionType.reward,
        asset: "BTC",
        quantity: 12.48,
        eurValue: 12.48,
        eurFee: 0,
      });
    });

    it("should parse XRP reward/staking deposit", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-08-04T06:45:03;Deposit;14.07;XRP;;;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        type: TransactionType.reward,
        asset: "XRP",
        quantity: 14.07,
        eurValue: 14.07,
        eurFee: 0,
      });
    });

    it("should parse Solana reward/staking deposit", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-09-02T06:45:18;Deposit;6.22;Solana;;;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        type: TransactionType.reward,
        asset: "SOL",
        quantity: 6.22,
        eurValue: 6.22,
        eurFee: 0,
      });
    });

    it("should skip non-crypto transactions (stock ETF)", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-07-02T13:45:30;Buy;-50.0;MSCI World Information Tech;IE00BJ5JNY98;3.910527;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip non-crypto deposits", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-07-01T11:57:52;Deposit;5000.0;MATTHIAS KLASS;;;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip interest transactions", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-07-01T00:19:54;Interest;1.29;Zinsen;;;;-0.48;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should skip card payments", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-06-30T12:46:08;Removal;-40.8;Card Payment - InterSPA;;;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should handle German number format (comma as decimal separator)", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-12-27T11:09:37;Dividend;0,66;MSCI World Info Tech;IE00BJ5JNY98;35,60427;;0,14;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should handle multiple crypto transactions", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-05T09:30:22;Buy;-1000.96;Bitcoin;XF000BTC0017;0.010376;-1.0;;;;
2025-01-17T14:53:49;Buy;-501.07;XRP;XF000XRP0018;156.327675;-1.0;;;;
2025-04-26T07:43:05;Buy;-2501.05;Solana;XF000SOL0012;18.207109;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].asset).toBe("BTC");
      expect(result.transactions[1].asset).toBe("XRP");
      expect(result.transactions[2].asset).toBe("SOL");
    });

    it("should parse buy fees and taxes correctly", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-05T09:30:22;Buy;-1000.96;Bitcoin;XF000BTC0017;0.010376;-1.0;-0.5;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].eurFee).toBe(1.5);
    });

    it("should skip tax refunds", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-07-16T22:58:06;Tax Refund;48.11;Steuerkorrektur;;;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });

    it("should throw ImportError for empty CSV", () => {
      const csv = "Date;Type\n";

      expect(() => service.parseCsv(csv, accountId)).toThrow(ImportError);
      expect(() => service.parseCsv(csv, accountId)).toThrow("CSV file is empty");
    });

    it("should throw ImportError for missing Date;Type header", () => {
      const csv = `Some Other Header,Value\ntest,100`;

      expect(() => service.parseCsv(csv, accountId)).toThrow(ImportError);
      expect(() => service.parseCsv(csv, accountId)).toThrow("Could not find 'Date;Type' header");
    });

    it("should throw ImportError for no valid transaction data", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2`;

      expect(() => service.parseCsv(csv, accountId)).toThrow("CSV file is empty");
    });

    it("should filter out all non-crypto transactions", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-07-01T00:19:54;Interest;1.29;Zinsen;;;;-0.48;;;
2024-07-01T11:57:52;Deposit;5000.0;Matthias Reimund Klass;;;;;;;
2024-07-02T13:45:30;Buy;-50.0;MSCI World Information Tech;IE00BJ5JNY98;3.910527;;;;`;

      const result = service.parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(0);
    });
  });

  describe("getAssetFromNote", () => {
    it("should map Bitcoin to BTC", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-06-02T08:10:32;Deposit;12.48;Bitcoin;;;;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions[0].asset).toBe("BTC");
    });

    it("should map XRP to XRP", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-08-04T06:45:03;Deposit;14.07;XRP;;;;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions[0].asset).toBe("XRP");
    });

    it("should map Solana to SOL", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-09-02T06:45:18;Deposit;6.22;Solana;;;;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions[0].asset).toBe("SOL");
    });
  });

  describe("isCryptoTransaction", () => {
    it("should identify Bitcoin buy by ISIN", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-05T09:30:22;Buy;-1000.96;Bitcoin;XF000BTC0017;0.010376;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions).toHaveLength(1);
    });

    it("should identify XRP buy by ISIN", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-01-17T14:53:49;Buy;-501.07;XRP;XF000XRP0018;156.327675;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions).toHaveLength(1);
    });

    it("should identify Solana buy by ISIN", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-04-26T07:43:05;Buy;-2501.05;Solana;XF000SOL0012;18.207109;-1.0;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions).toHaveLength(1);
    });

    it("should identify crypto deposit by asset name", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2025-06-02T08:10:32;Deposit;12.48;Bitcoin;;;;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions).toHaveLength(1);
    });

    it("should skip non-crypto ISIN prefixes", () => {
      const csv = `Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
2024-07-02T13:45:30;Buy;-50.0;MSCI World Information Tech;IE00BJ5JNY98;3.910527;;;;`;

      const result = service.parseCsv(csv, accountId);
      expect(result.transactions).toHaveLength(0);
    });
  });
});