import { describe, it, expect } from "vitest";
import { calculatePortfolioChange, calculateOverallChange, calculatePriceChangeByDate, type PortfolioHistoryPoint, type PriceHistoryPoint } from "./portfolio-change";

function createHistoryPoint(date: string, totalEurValue: number, totalEurInvested = 0): PortfolioHistoryPoint {
	return {
		date,
		totalEurValue,
		totalEurInvested,
		assets: {},
	};
}

function createPricePoint(date: string, priceEur: number): PriceHistoryPoint {
	return { date, priceEur };
}

describe("calculatePortfolioChange", () => {
	it("should return null for empty history", () => {
		expect(calculatePortfolioChange([], 7)).toBeNull();
	});

	it("should return null for single point history", () => {
		const history = [createHistoryPoint("2024-01-15", 1000)];
		expect(calculatePortfolioChange(history, 7)).toBeNull();
	});

	it("should return null when latest value is null", () => {
		const history: PortfolioHistoryPoint[] = [
			createHistoryPoint("2024-01-08", 1000),
			{ date: "2024-01-15", totalEurValue: null, totalEurInvested: 0, assets: {} },
		];
		expect(calculatePortfolioChange(history, 7)).toBeNull();
	});

	it("should return null when past value is null", () => {
		const history: PortfolioHistoryPoint[] = [
			{ date: "2024-01-08", totalEurValue: null, totalEurInvested: 0, assets: {} },
			createHistoryPoint("2024-01-15", 1000),
		];
		expect(calculatePortfolioChange(history, 7)).toBeNull();
	});

	it("should return null when target date is same as latest", () => {
		const history = [
			createHistoryPoint("2024-01-15", 1000),
			createHistoryPoint("2024-01-15", 1100),
		];
		expect(calculatePortfolioChange(history, 0)).toBeNull();
	});

	it("should calculate change correctly for exact date match", () => {
		const history = [
			createHistoryPoint("2024-01-08", 1000),
			createHistoryPoint("2024-01-15", 1100),
		];
		const result = calculatePortfolioChange(history, 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(100);
		expect(result!.relative).toBe(10);
	});

	it("should calculate change for profit", () => {
		const history = [
			createHistoryPoint("2024-01-01", 1000),
			createHistoryPoint("2024-01-08", 1050),
			createHistoryPoint("2024-01-15", 1100),
		];
		const result = calculatePortfolioChange(history, 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(50);
		expect(result!.relative).toBeCloseTo(4.76, 2);
	});

	it("should calculate change for loss", () => {
		const history = [
			createHistoryPoint("2024-01-01", 1000),
			createHistoryPoint("2024-01-08", 1100),
			createHistoryPoint("2024-01-15", 1000),
		];
		const result = calculatePortfolioChange(history, 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(-100);
		expect(result!.relative).toBeCloseTo(-9.09, 2);
	});

	it("should find closest past date when exact match not available", () => {
		// For 7 days: tolerance = min(24, max(6, 3.5)) = 6 hours
		// Past entry at 2024-01-07T20:00:00 is 4 hours before target 2024-01-08T00:00:00
		const history = [
			createHistoryPoint("2024-01-01", 1000),
			{ date: "2024-01-07T20:00:00", totalEurValue: 1020, totalEurInvested: 0, assets: {} },
			createHistoryPoint("2024-01-15", 1100),
		];
		const result = calculatePortfolioChange(history, 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(80);
		expect(result!.relative).toBeCloseTo(7.84, 2);
	});

	it("should return null when target date is before all history", () => {
		const history = [
			createHistoryPoint("2024-01-10", 1000),
			createHistoryPoint("2024-01-15", 1100),
		];
		expect(calculatePortfolioChange(history, 10)).toBeNull();
	});

	it("should handle 1 day change", () => {
		const history = [
			createHistoryPoint("2024-01-14", 1000),
			createHistoryPoint("2024-01-15", 1050),
		];
		const result = calculatePortfolioChange(history, 1);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(50);
		expect(result!.relative).toBe(5);
	});

	it("should handle 30 day change", () => {
		const history = [
			createHistoryPoint("2024-01-01", 1000),
			createHistoryPoint("2024-01-15", 1100),
			createHistoryPoint("2024-01-31", 1200),
		];
		const result = calculatePortfolioChange(history, 30);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(200);
		expect(result!.relative).toBe(20);
	});

	it("should handle negative totalEurValue", () => {
		const history = [
			createHistoryPoint("2024-01-08", -1000),
			createHistoryPoint("2024-01-15", -900),
		];
		const result = calculatePortfolioChange(history, 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(100);
		expect(result!.relative).toBe(-10);
	});

	it("should handle zero past value without division error", () => {
		const history = [
			createHistoryPoint("2024-01-08", 0),
			createHistoryPoint("2024-01-15", 100),
		];
		const result = calculatePortfolioChange(history, 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(100);
		expect(result!.relative).toBe(Infinity);
	});

	it("should return null when closest past date is too far from target (outside tolerance)", () => {
		// Latest: 2024-01-31, Target for 30d: 2024-01-01
		// Closest entry on or before target: 2023-12-20 (12 days before target)
		// That's 42 days before latest instead of 30 - outside tolerance
		const history = [
			createHistoryPoint("2023-12-20", 1000),  // 12 days BEFORE target date
			createHistoryPoint("2024-01-31", 1100),
		];
		const result = calculatePortfolioChange(history, 30);
		// This should return null because the closest entry is 12 days before target
		// (42 days before latest), but currently it returns a result using Dec 20
		expect(result).toBeNull();
	});
});

describe("calculateOverallChange", () => {
	it("should return null when latestValue is null", () => {
		expect(calculateOverallChange(null, 1000)).toBeNull();
	});

	it("should return null when eurInvested is zero", () => {
		expect(calculateOverallChange(1500, 0)).toBeNull();
	});

	it("should return null when eurInvested is negative", () => {
		expect(calculateOverallChange(1500, -100)).toBeNull();
	});

	it("should calculate profit correctly", () => {
		const result = calculateOverallChange(1500, 1000);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(500);
		expect(result!.relative).toBe(50);
	});

	it("should calculate loss correctly", () => {
		const result = calculateOverallChange(800, 1000);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(-200);
		expect(result!.relative).toBe(-20);
	});

	it("should handle zero value correctly", () => {
		const result = calculateOverallChange(0, 1000);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(-1000);
		expect(result!.relative).toBe(-100);
	});

	it("should handle no change correctly", () => {
		const result = calculateOverallChange(1000, 1000);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(0);
		expect(result!.relative).toBe(0);
	});
});

describe("calculatePriceChangeByDate", () => {
	it("should return null for empty history", () => {
		expect(calculatePriceChangeByDate([], 24)).toBeNull();
	});

	it("should return null for single point history", () => {
		const history = [createPricePoint("2024-01-15T12:00:00Z", 50000)];
		expect(calculatePriceChangeByDate(history, 24)).toBeNull();
	});

	it("should calculate rolling 24h change", () => {
		const history = [
			createPricePoint("2024-01-14T12:00:00Z", 50000),
			createPricePoint("2024-01-15T12:00:00Z", 55000),
		];
		const result = calculatePriceChangeByDate(history, 24);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(5000);
		expect(result!.relative).toBe(10);
	});

	it("should find closest past timestamp when exact match not available", () => {
		const history = [
			createPricePoint("2024-01-01T00:00:00Z", 50000),
			createPricePoint("2024-01-05T00:00:00Z", 51000),
			createPricePoint("2024-01-15T00:00:00Z", 55000),
		];
		const result = calculatePriceChangeByDate(history, 24 * 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(4000);
		expect(result!.relative).toBeCloseTo(7.84, 2);
	});

	it("should return null when target time is before all history", () => {
		const history = [
			createPricePoint("2024-01-10T00:00:00Z", 50000),
			createPricePoint("2024-01-15T00:00:00Z", 55000),
		];
		expect(calculatePriceChangeByDate(history, 24 * 10)).toBeNull();
	});

	it("should return null when target time equals latest time", () => {
		const history = [
			createPricePoint("2024-01-15T12:00:00Z", 50000),
			createPricePoint("2024-01-15T12:00:00Z", 55000),
		];
		expect(calculatePriceChangeByDate(history, 0)).toBeNull();
	});

	it("should handle 1 hour change", () => {
		const history = [
			createPricePoint("2024-01-15T11:00:00Z", 50000),
			createPricePoint("2024-01-15T12:00:00Z", 50500),
		];
		const result = calculatePriceChangeByDate(history, 1);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(500);
		expect(result!.relative).toBe(1);
	});

	it("should handle 7 day change in hours", () => {
		const history = [
			createPricePoint("2024-01-01T00:00:00Z", 50000),
			createPricePoint("2024-01-08T00:00:00Z", 52500),
		];
		const result = calculatePriceChangeByDate(history, 24 * 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(2500);
		expect(result!.relative).toBe(5);
	});

	it("should handle zero price correctly", () => {
		const history = [
			createPricePoint("2024-01-08T00:00:00Z", 0),
			createPricePoint("2024-01-15T00:00:00Z", 100),
		];
		const result = calculatePriceChangeByDate(history, 24 * 7);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(100);
		expect(result!.relative).toBe(Infinity);
	});

	it("should return null for undefined history", () => {
		expect(calculatePriceChangeByDate(undefined as any, 24)).toBeNull();
	});

	it("should match rolling 24h scenario with minute-level data", () => {
		const history = [
			createPricePoint("2026-03-15T22:30:00Z", 64200),
			createPricePoint("2026-03-15T22:35:00Z", 64100),
			createPricePoint("2026-03-16T22:30:00Z", 64887),
			createPricePoint("2026-03-16T22:35:00Z", 64887),
		];
		const result = calculatePriceChangeByDate(history, 24);
		expect(result).not.toBeNull();
		expect(result!.absolute).toBe(787);
		expect(result!.relative).toBeCloseTo(1.23, 2);
	});
});
