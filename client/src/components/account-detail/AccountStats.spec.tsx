import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountStats } from "./AccountStats";
import type { PortfolioHistoryPoint } from "@txls/shared";

function createHistoryPoint(
	overrides: Partial<PortfolioHistoryPoint> = {}
): PortfolioHistoryPoint {
	return {
		date: "2024-06-15",
		totalEurValue: 1000,
		totalEurInvested: 800,
		assets: {},
		...overrides,
	};
}

describe("AccountStats", () => {
	describe("Overall calculation", () => {
		it("should calculate overall change using totalEurInvested", () => {
			const history: PortfolioHistoryPoint[] = [
				createHistoryPoint({
					date: "2024-06-15",
					totalEurValue: 1000,
					totalEurInvested: 800,
				}),
			];

			render(<AccountStats history={history} variant="overall" />);

			expect(screen.getByText("Overall")).toBeInTheDocument();
			expect(screen.getByText(/\+200,00/)).toBeInTheDocument();
			expect(screen.getByText(/\+25\.00%/)).toBeInTheDocument();
		});

		it("should show negative overall change when value is below invested", () => {
			const history: PortfolioHistoryPoint[] = [
				createHistoryPoint({
					date: "2024-06-15",
					totalEurValue: 600,
					totalEurInvested: 800,
				}),
			];

			render(<AccountStats history={history} variant="overall" />);

			expect(screen.getByText("Overall")).toBeInTheDocument();
			expect(screen.getByText(/-200,00/)).toBeInTheDocument();
			expect(screen.getByText(/-25\.00%/)).toBeInTheDocument();
		});

		it("should not show overall change when totalEurInvested is zero", () => {
			const history: PortfolioHistoryPoint[] = [
				createHistoryPoint({
					date: "2024-06-15",
					totalEurValue: 1000,
					totalEurInvested: 0,
				}),
			];

			render(<AccountStats history={history} variant="overall" />);

			expect(screen.getByText("Overall")).toBeInTheDocument();
			const dashes = screen.getAllByText("-");
			expect(dashes.length).toBe(2);
		});

		it("should work with a single history entry (fresh import)", () => {
			const history: PortfolioHistoryPoint[] = [
				createHistoryPoint({
					date: "2024-06-15",
					totalEurValue: 1100,
					totalEurInvested: 1000,
				}),
			];

			render(<AccountStats history={history} variant="overall" />);

			expect(screen.getByText("Overall")).toBeInTheDocument();
			expect(screen.getByText(/\+100,00/)).toBeInTheDocument();
			expect(screen.getByText(/\+10\.00%/)).toBeInTheDocument();
		});
	});

	describe("full variant", () => {
		it("should render all time period cards", () => {
			const history: PortfolioHistoryPoint[] = [
				createHistoryPoint({ date: "2024-06-01", totalEurValue: 900 }),
				createHistoryPoint({ date: "2024-06-15", totalEurValue: 1000 }),
			];

			render(<AccountStats history={history} />);

			expect(screen.getByText("24h")).toBeInTheDocument();
			expect(screen.getByText("7d")).toBeInTheDocument();
			expect(screen.getByText("30d")).toBeInTheDocument();
			expect(screen.getByText("90d")).toBeInTheDocument();
		});
	});

	describe("edge cases", () => {
		it("should return null when history is empty", () => {
			const { container } = render(<AccountStats history={[]} />);
			expect(container.firstChild).toBeNull();
		});

		it("should return null when totalEurValue is null", () => {
			const history: PortfolioHistoryPoint[] = [
				createHistoryPoint({ totalEurValue: null }),
			];

			const { container } = render(<AccountStats history={history} />);
			expect(container.firstChild).toBeNull();
		});
	});
});
