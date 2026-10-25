import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StakingRewardByAsset } from '../../lib/client/prices-api'
import { StakingRewardsBreakdown } from './StakingRewardsBreakdown'

const breakdown: StakingRewardByAsset[] = [
	{ asset: 'SOL', eurValue: 793.6, count: 53 },
	{ asset: 'ETH', eurValue: 250.18, count: 52 },
]

describe('StakingRewardsBreakdown', () => {
	it('renders one row per asset with count and formatted EUR value', () => {
		render(<StakingRewardsBreakdown rewards={breakdown} />)

		expect(screen.getByText('SOL · 53 rewards')).toBeInTheDocument()
		expect(screen.getByText('ETH · 52 rewards')).toBeInTheDocument()
		expect(screen.getByText('793,60 €')).toBeInTheDocument()
		expect(screen.getByText('250,18 €')).toBeInTheDocument()
	})

	it('renders nothing when the breakdown is empty', () => {
		const { container } = render(<StakingRewardsBreakdown rewards={[]} />)

		expect(container).toBeEmptyDOMElement()
	})
})
