import { describe, it, expect } from "vitest";
import { calculatePortfolioChange, type PortfolioHistoryPoint } from "./portfolio-change";

function createHistoryPoint(date: string, totalEurValue: number): PortfolioHistoryPoint {
	return {
		date,
		totalEurValue,
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
		const history = [
			createHistoryPoint("2024-01-08", 1000),
			{ date: "2024-01-15", totalEurValue: null, assets: {} },
		];
		expect(calculatePortfolioChange(history, 7)).toBeNull();
	});

	it("should return null when past value is null", () => {
		const history = [
			{ date: "2024-01-08", totalEurValue: null, assets: {} },
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
