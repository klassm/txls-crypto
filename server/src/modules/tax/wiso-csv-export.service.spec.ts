import { describe, it, expect } from "vitest";
import { WisoCsvExportService } from "./wiso-csv-export.service.js";
import { TaxCalculationService, type TaxCalculation } from "./tax-calculator.service.js";
import type { Transaction } from "@txls/shared";
import { DateTime } from "luxon";

describe("WisoCsvExportService", () => {
  const createTransaction = (
    id: number,
    timestamp: string,
    type: "buy" | "sell" | "reward",
    asset: string,
    quantity: number,
    eurValue: number,
    eurFee: number = 0,
  ): Transaction => ({
    id,
    providerAccountId: 1,
    externalId: `test-${id}`,
    processed: true,
    timestamp: DateTime.fromISO(timestamp),
    type: type as any,
    asset,
    quantity,
    eurValue,
    eurFee,
  });

  describe("formatGermanDate", () => {
    it("should format date in German format", () => {
      const service = new WisoCsvExportService();
      const date = DateTime.fromISO("2024-01-15T00:00:00Z");
      expect(service.formatGermanDate(date)).toBe("15.01.2024");
    });

    it("should format date on last day of month", () => {
      const service = new WisoCsvExportService();
      const date = DateTime.fromISO("2024-12-31T00:00:00Z");
      expect(service.formatGermanDate(date)).toBe("31.12.2024");
    });

    it("should pad single digit day and month", () => {
      const service = new WisoCsvExportService();
      const date = DateTime.fromISO("2024-02-03T00:00:00Z");
      expect(service.formatGermanDate(date)).toBe("03.02.2024");
    });
  });

  describe("generateCsv", () => {
    it("should generate correct header", () => {
      const exportService = new WisoCsvExportService();
      const taxCalculations = new Map<string, TaxCalculation>();

      const csv = exportService.generateCsv(taxCalculations, 2024, "Bitpanda");
      const lines = csv.split("\n");

      expect(lines[0]).toBe("Identifier:Capital_Gains,Method:FIFO,Tax_Year:2024,Base_Currency:EUR");
      expect(lines[1]).toBe(
        "Amount,Currency,Date Sold,Date Acquired,Short/Long,Buy/Input at,Sell/Output at,Proceeds,Cost Basis,Gain/Loss"
      );
    });

    it("should generate CSV with one transaction", () => {
      const taxService = new TaxCalculationService();
      const exportService = new WisoCsvExportService();

      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const taxResult = taxService.calculateTaxForYear(transactions, 2024);
      const csv = exportService.generateCsv(taxResult.assetCalculations, 2024, "Bitpanda");

      const lines = csv.split("\n");
      expect(lines.length).toBe(3);

      const dataLine = lines[2];
      expect(dataLine.startsWith("0.10000000,BTC,15.06.2024,15.01.2024,Short,Bitpanda,Bitpanda,")).toBe(true);
      expect(dataLine.includes(",1190.00,1000.00,190.00")).toBe(true);
    });

    it("should mark long-term holdings as Long", () => {
      const taxService = new TaxCalculationService();
      const exportService = new WisoCsvExportService();

      const transactions: Transaction[] = [
        createTransaction(1, "2020-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const taxResult = taxService.calculateTaxForYear(transactions, 2024);
      const csv = exportService.generateCsv(taxResult.assetCalculations, 2024, "Bitpanda");

      const lines = csv.split("\n");
      expect(lines[2]).toContain(",Long,");
    });

    it("should handle multiple assets", () => {
      const taxService = new TaxCalculationService();
      const exportService = new WisoCsvExportService();

      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-01T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
        createTransaction(3, "2024-02-01T00:00:00Z", "buy", "ETH", 1.5, 1500, 0),
        createTransaction(4, "2024-07-01T00:00:00Z", "sell", "ETH", 1.5, 1800, 15),
      ];

      const taxResult = taxService.calculateTaxForYear(transactions, 2024);
      const csv = exportService.generateCsv(taxResult.assetCalculations, 2024, "Bitpanda");

      const lines = csv.split("\n");
      expect(lines.length).toBe(4);
      expect(lines[2]).toContain("0.10000000,BTC");
      expect(lines[3]).toContain("1.50000000,ETH");
    });

    it("should handle loss transactions", () => {
      const taxService = new TaxCalculationService();
      const exportService = new WisoCsvExportService();

      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1200, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1000, 10),
      ];

      const taxResult = taxService.calculateTaxForYear(transactions, 2024);
      const csv = exportService.generateCsv(taxResult.assetCalculations, 2024, "Bitpanda");

      const lines = csv.split("\n");
      expect(lines[2]).toContain(",990.00,1200.00,-210.00");
    });

    it("should use specified source name", () => {
      const taxService = new TaxCalculationService();
      const exportService = new WisoCsvExportService();

      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const taxResult = taxService.calculateTaxForYear(transactions, 2024);
      const csv = exportService.generateCsv(taxResult.assetCalculations, 2024, "TradeRepublic");

      const lines = csv.split("\n");
      expect(lines[2]).toContain(",TradeRepublic,TradeRepublic,");
    });
  });
});
