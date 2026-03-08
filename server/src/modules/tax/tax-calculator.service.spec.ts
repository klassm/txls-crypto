import { describe, it, expect } from "vitest";
import { TaxCalculationService } from "./tax-calculator.service.js";
import type { Transaction } from "@txls/shared";
import { DateTime } from "luxon";

describe("TaxCalculationService", () => {
  const createTransaction = (
    id: number,
    timestamp: string,
    type: "buy" | "sell" | "reward" | "transfer_out" | "transfer_in",
    asset: string,
    quantity: number,
    eurValue: number,
    eurFee: number,
    providerAccountId: number = 1,
  ): Transaction => ({
    id,
    providerAccountId,
    externalId: `test-${id}`,
    processed: true,
    timestamp: DateTime.fromISO(timestamp),
    type: type as any,
    asset,
    quantity,
    eurValue,
    eurFee,
  });

  describe("calculateTax", () => {
    it("should return empty map for no transactions", () => {
      const service = new TaxCalculationService();
      const result = service.calculateTax([]);
      expect(result.size).toBe(0);
    });

    it("should calculate gain for simple buy/sell pair", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.totalGain).toBeCloseTo(190, 2);
      expect(btcCalc?.transactions).toHaveLength(1);
    });

    it("should calculate loss when sell price is lower", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1200, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1000, 10),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.totalLoss).toBeCloseTo(210, 2);
      expect(btcCalc?.totalGain).toBe(0);
    });

    it("should handle multiple assets independently", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-01T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
        createTransaction(3, "2024-02-01T00:00:00Z", "buy", "ETH", 1.5, 1500, 0),
        createTransaction(4, "2024-07-01T00:00:00Z", "sell", "ETH", 1.5, 1800, 15),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(2);
      expect(result.get("BTC")?.transactions).toHaveLength(1);
      expect(result.get("ETH")?.transactions).toHaveLength(1);
    });

    it("should handle sell without matching buy", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-20T00:00:00Z", "sell", "BTC", 0.001, 30, 0),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.totalGain).toBe(30);
    });
  });

  describe("FIFO ordering", () => {
    it("should consume lots in FIFO order", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-02-01T00:00:00Z", "buy", "BTC", 0.1, 2000, 0),
        createTransaction(3, "2024-06-01T00:00:00Z", "sell", "BTC", 0.15, 3000, 0),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(2);

      expect(btcCalc?.transactions[0].quantity).toBeCloseTo(0.1, 5);
      expect(btcCalc?.transactions[0].costBasis).toBeCloseTo(1000, 2);

      expect(btcCalc?.transactions[1].quantity).toBeCloseTo(0.05, 5);
      expect(btcCalc?.transactions[1].costBasis).toBeCloseTo(1000, 2);
    });
  });

  describe("staking rewards", () => {
    it("should add rewards to buy queue", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "reward", "BTC", 0.001, 25, 0),
        createTransaction(2, "2024-06-20T00:00:00Z", "sell", "BTC", 0.001, 30, 0),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(1);
      const btcCalc = result.get("BTC");
      expect(btcCalc?.totalGain).toBeCloseTo(5, 2);
    });

    it("should mix rewards and buys in FIFO order", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "reward", "BTC", 0.001, 25, 0),
        createTransaction(2, "2024-02-01T00:00:00Z", "buy", "BTC", 0.002, 60, 0),
        createTransaction(3, "2024-06-20T00:00:00Z", "sell", "BTC", 0.003, 95, 0),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(2);
    });
  });

  describe("applyGermanTaxRules", () => {
    it("should mark holdings over 365 days as tax-free", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2020-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const calc = service.calculateTax(transactions);
      const taxTransactions = calc.get("BTC")?.transactions || [];
      const result = service.applyGermanTaxRules(taxTransactions);

      expect(result[0].isTaxFree).toBe(true);
      expect(result[0].exemptionReason).toBe("long_term_holding");
    });

    it("should mark short-term holdings as taxable when above €1000 exemption limit", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 2500, 10),
      ];

      const calc = service.calculateTax(transactions);
      const taxTransactions = calc.get("BTC")?.transactions || [];
      const result = service.applyGermanTaxRules(taxTransactions);

      expect(result[0].holdingPeriodDays).toBeLessThan(365);
      expect(result[0].isTaxFree).toBe(false);
      expect(result[0].exemptionReason).toBe("none");
    });

    it("should mark short-term holdings as tax-free when below €1000 exemption limit", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const calc = service.calculateTax(transactions);
      const taxTransactions = calc.get("BTC")?.transactions || [];
      const result = service.applyGermanTaxRules(taxTransactions);

      expect(result[0].holdingPeriodDays).toBeLessThan(365);
      expect(result[0].isTaxFree).toBe(true);
      expect(result[0].exemptionReason).toBe("exemption_limit_1000");
    });
  });

  describe("transfers between own accounts", () => {
    it("should match transfer_out and transfer_in, preserving original acquisition date", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2023-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-01T00:00:00Z", "transfer_out", "BTC", 0.1, 2000, 5, 1),
        createTransaction(3, "2024-06-01T01:00:00Z", "transfer_in", "BTC", 0.1, 2000, 0, 2),
        createTransaction(4, "2024-12-01T00:00:00Z", "sell", "BTC", 0.1, 2500, 10, 2),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(1);
      
      const taxTx = btcCalc?.transactions[0];
      expect(taxTx?.holdingPeriodDays).toBeGreaterThan(365);
      expect(taxTx?.costBasis).toBeCloseTo(1000, 2);
    });

    it("should not create taxable event for matched transfer pair", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-01T00:00:00Z", "transfer_out", "BTC", 0.1, 1500, 5, 1),
        createTransaction(3, "2024-06-01T01:00:00Z", "transfer_in", "BTC", 0.1, 1500, 0, 2),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(0);
    });

    it("should handle partial transfer (transfer_out less than held)", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2023-01-01T00:00:00Z", "buy", "BTC", 0.2, 2000, 0),
        createTransaction(2, "2024-06-01T00:00:00Z", "transfer_out", "BTC", 0.1, 1500, 5, 1),
        createTransaction(3, "2024-06-01T01:00:00Z", "transfer_in", "BTC", 0.1, 1500, 0, 2),
        createTransaction(4, "2024-12-01T00:00:00Z", "sell", "BTC", 0.15, 3000, 10, 2),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(2);
      
      const taxTx = btcCalc?.transactions[0];
      expect(taxTx?.holdingPeriodDays).toBeGreaterThan(365);
    });

    it("should handle unmatched transfer_in from external wallet", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-06-01T00:00:00Z", "transfer_in", "BTC", 0.1, 2000, 0),
        createTransaction(2, "2024-12-01T00:00:00Z", "sell", "BTC", 0.1, 2500, 10),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(1);
      expect(btcCalc?.transactions[0].holdingPeriodDays).toBeLessThan(365);
      expect(btcCalc?.transactions[0].costBasis).toBeCloseTo(2000, 2);
    });

    it("should not create taxable event for unmatched transfer_out to external wallet", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-01T00:00:00Z", "transfer_out", "BTC", 0.1, 1500, 5),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(0);
    });

    it("should handle multiple unmatched transfer_outs without creating taxable events", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "buy", "SOL", 20, 2000, 0),
        createTransaction(2, "2024-01-02T00:00:00Z", "buy", "ETH", 2, 3000, 0),
        createTransaction(3, "2024-06-01T00:00:00Z", "transfer_out", "SOL", 19.78, 2436, 5),
        createTransaction(4, "2024-06-02T00:00:00Z", "transfer_out", "SOL", 18.90, 2432, 5),
        createTransaction(5, "2024-07-01T00:00:00Z", "transfer_out", "ETH", 1.26, 3913, 5),
      ];

      const result = service.calculateTax(transactions);

      expect(result.size).toBe(0);
    });

    it("should preserve FIFO order when matching transfers", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2022-01-01T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-01-01T00:00:00Z", "buy", "BTC", 0.1, 2000, 0),
        createTransaction(3, "2024-06-01T00:00:00Z", "transfer_out", "BTC", 0.15, 3000, 5, 1),
        createTransaction(4, "2024-06-01T01:00:00Z", "transfer_in", "BTC", 0.15, 3000, 0, 2),
        createTransaction(5, "2024-12-01T00:00:00Z", "sell", "BTC", 0.15, 4000, 10, 2),
      ];

      const result = service.calculateTax(transactions);

      const btcCalc = result.get("BTC");
      expect(btcCalc?.transactions).toHaveLength(2);
      
      const firstLot = btcCalc?.transactions[0];
      expect(firstLot?.quantity).toBeCloseTo(0.1, 5);
      expect(firstLot?.holdingPeriodDays).toBeGreaterThan(365);
      expect(firstLot?.costBasis).toBeCloseTo(1000, 2);
      
      const secondLot = btcCalc?.transactions[1];
      expect(secondLot?.quantity).toBeCloseTo(0.05, 5);
      expect(secondLot?.holdingPeriodDays).toBeLessThan(365);
      expect(secondLot?.costBasis).toBeCloseTo(1000, 2);
    });
  });

  describe("calculateTaxForYear", () => {
    it("should only include transactions for the specified year", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2023-01-15T00:00:00Z", "buy", "BTC", 0.1, 1000, 0),
        createTransaction(2, "2024-06-15T00:00:00Z", "sell", "BTC", 0.1, 1200, 10),
      ];

      const result = service.calculateTaxForYear(transactions, 2024);

      expect(result.assetCalculations.size).toBe(1);
    });

    it("should calculate staking rewards for the year", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-03-15T00:00:00Z", "reward", "BTC", 0.001, 25, 0),
        createTransaction(2, "2024-06-20T00:00:00Z", "reward", "ETH", 0.1, 30, 0),
      ];

      const result = service.calculateTaxForYear(transactions, 2024);

      expect(result.stakingRewardsExempt).toBe(55);
      expect(result.stakingRewardsTaxable).toBe(0);
    });

    it("should mark staking rewards over €256 as taxable", () => {
      const service = new TaxCalculationService();
      const transactions: Transaction[] = [
        createTransaction(1, "2024-01-01T00:00:00Z", "reward", "BTC", 0.01, 300, 0),
      ];

      const result = service.calculateTaxForYear(transactions, 2024);

      expect(result.stakingRewardsExempt).toBe(0);
      expect(result.stakingRewardsTaxable).toBe(300);
    });
  });
});
