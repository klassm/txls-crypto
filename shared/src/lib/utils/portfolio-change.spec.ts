import { describe, it, expect } from "vitest";
import { calculatePortfolioChange, calculateOverallChange, type PortfolioHistoryPoint } from "./portfolio-change";

function createHistoryPoint(date: string, totalEurValue: number, totalEurInvested = 0): PortfolioHistoryPoint {
	return {
		date,
		totalEurValue,
		totalEurInvested,
		assets: {},
	};
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
		const history = [
			createHistoryPoint("2024-01-01", 1000),
			createHistoryPoint("2024-01-05", 1020),
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
