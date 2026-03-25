import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssetCard } from "./AssetCard";
import type { AssetOverview } from "../../lib/client/prices-api";

function createAsset(overrides: Partial<AssetOverview> = {}): AssetOverview {
	return {
		asset: "BTC",
		amount: 0.5,
		eurValue: 25000,
		eurInvested: 20000,
		priceHistory: [
			{ date: "2024-06-01T00:00:00Z", priceEur: 45000 },
			{ date: "2024-06-15T00:00:00Z", priceEur: 50000 },
		],
		positionHistory: [
			{ date: "2024-06-01T00:00:00Z", value: 22500 },
			{ date: "2024-06-15T00:00:00Z", value: 25000 },
		],
		priceChanges: {
			day: { absolute: 500, relative: 1.0 },
			week: { absolute: 1000, relative: 2.0 },
			month: { absolute: 2000, relative: 4.0 },
		},
		...overrides,
	};
}

function renderWithQueryClient(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});
	return render(
		<QueryClientProvider client={queryClient}>
			{ui}
		</QueryClientProvider>
	);
}

describe("AssetCard", () => {
	it("should render asset name", () => {
		const asset = createAsset();
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText("BTC")).toBeInTheDocument();
	});

	it("should render position value in EUR", () => {
		const asset = createAsset({ eurValue: 25000 });
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText(/25.000,00/)).toBeInTheDocument();
	});

	it("should render asset amount", () => {
		const asset = createAsset({ amount: 0.12345678 });
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText(/Position \(0.1235\)/)).toBeInTheDocument();
	});

	it("should render overall change when there is profit", () => {
		const asset = createAsset({
			eurValue: 25000,
			eurInvested: 20000,
		});
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getAllByText(/\+5.000,00/).length).toBeGreaterThan(0);
		expect(screen.getByText(/\+25.00%/)).toBeInTheDocument();
	});

	it("should render overall change when there is loss", () => {
		const asset = createAsset({
			eurValue: 15000,
			eurInvested: 20000,
		});
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText(/-5.000,00/)).toBeInTheDocument();
		expect(screen.getByText(/-25.00%/)).toBeInTheDocument();
	});

	it("should render price label", () => {
		const asset = createAsset();
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText("Price")).toBeInTheDocument();
	});

	it("should render time period labels", () => {
		const asset = createAsset();
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText("24h")).toBeInTheDocument();
		expect(screen.getByText("7d")).toBeInTheDocument();
		expect(screen.getByText("30d")).toBeInTheDocument();
	});

	it("should show no price data when price history is empty", () => {
		const asset = createAsset({ priceHistory: [] });
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText("No price data available")).toBeInTheDocument();
	});

	it("should handle null eurValue by calculating from price and amount", () => {
		const asset = createAsset({
			eurValue: null,
			amount: 0.5,
			priceHistory: [
				{ date: "2024-06-15T00:00:00Z", priceEur: 50000 },
			],
		});
		renderWithQueryClient(<AssetCard asset={asset} />);
		expect(screen.getByText(/25.000,00/)).toBeInTheDocument();
	});
});
