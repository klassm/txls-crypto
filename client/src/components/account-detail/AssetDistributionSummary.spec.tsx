import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AssetOverview, PortfolioHistoryPoint } from '../../lib/client/prices-api'
import { AssetDistributionSummary } from './AssetDistributionSummary'

// jsdom lacks ResizeObserver, which recharts' ResponsiveContainer requires
vi.stubGlobal(
	'ResizeObserver',
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
)

function createHistory(): PortfolioHistoryPoint {
	return {
		date: '2024-06-15T00:00:00Z',
		totalEurValue: 50017.72,
		totalEurInvested: 40000,
		assets: {
			BTC: { amount: 1, eurValue: 50000 },
			VSN: { amount: 100, eurValue: 17.72 },
		},
	}
}

function createAsset(overrides: Partial<AssetOverview> = {}): AssetOverview {
	return {
		asset: 'BTC',
		amount: 1,
		eurValue: 50000,
		eurInvested: 40000,
		priceHistory: [
			{ date: '2024-06-01T00:00:00Z', priceEur: 45000 },
			{ date: '2024-06-15T00:00:00Z', priceEur: 50000 },
		],
		positionHistory: [
			{ date: '2024-06-01T00:00:00Z', value: 45000 },
			{ date: '2024-06-15T00:00:00Z', value: 50000 },
		],
		priceChanges: {
			day: { absolute: 500, relative: 1.0 },
			week: { absolute: 1000, relative: 2.0 },
			month: { absolute: 2000, relative: 4.0 },
		},
		...overrides,
	}
}

describe('AssetDistributionSummary', () => {
	it('should reserve the expand button slot for every asset so rows stay aligned', () => {
		const assets = [
			createAsset(),
			createAsset({
				asset: 'VSN',
				amount: 100,
				eurValue: 17.72,
				priceHistory: [],
				positionHistory: [],
				priceChanges: undefined,
			}),
		]
		render(<AssetDistributionSummary history={[createHistory()]} assets={assets} />)

		const allButtons = screen.getAllByRole('button', { hidden: true })
		expect(allButtons).toHaveLength(2)
	})

	it('should hide the expand button for assets without price history', () => {
		const assets = [
			createAsset(),
			createAsset({
				asset: 'VSN',
				amount: 100,
				eurValue: 17.72,
				priceHistory: [],
				positionHistory: [],
				priceChanges: undefined,
			}),
		]
		render(<AssetDistributionSummary history={[createHistory()]} assets={assets} />)

		const visibleButton = screen.getByRole('button', { name: 'Open BTC chart' })
		const hiddenButton = screen
			.getAllByRole('button', { hidden: true })
			.find((button) => button !== visibleButton)
		expect(visibleButton).toBeVisible()
		expect(hiddenButton).toBeDefined()
		expect(hiddenButton).toHaveStyle({
			visibility: 'hidden',
		})
	})

	it('should not list dust assets worth less than one cent', () => {
		const history = createHistory()
		history.assets.XRP = { amount: 0.00000001, eurValue: 0.00000116 }
		render(<AssetDistributionSummary history={[history]} assets={[createAsset()]} />)

		expect(screen.queryByText('XRP')).not.toBeInTheDocument()
	})

	it('should format tiny amounts without exponent notation', () => {
		const history = createHistory()
		history.assets.XRP = { amount: 0.00000001, eurValue: 0.02 }
		render(<AssetDistributionSummary history={[history]} assets={[createAsset()]} />)

		expect(screen.getByText('XRP')).toBeInTheDocument()
		expect(screen.getByText('0.00000001')).toBeInTheDocument()
		const xrpTexts = screen.queryAllByText(/e-/)
		expect(xrpTexts).toHaveLength(0)
	})
})
