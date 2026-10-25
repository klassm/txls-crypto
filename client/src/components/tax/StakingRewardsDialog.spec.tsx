import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StakingRewardByAsset } from '../../lib/client/prices-api'
import { StakingRewardsDialog } from './StakingRewardsDialog'

const rewards: StakingRewardByAsset[] = [
	{ asset: 'SOL', eurValue: 668.21, count: 42 },
	{ asset: 'EURCV', eurValue: 458.66, count: 10 },
]

describe('StakingRewardsDialog', () => {
	it('shows the per-asset breakdown when open', () => {
		render(<StakingRewardsDialog open onClose={vi.fn()} year={2026} rewards={rewards} />)

		expect(screen.getByText('Staking Rewards by Asset (2026)')).toBeInTheDocument()
		expect(screen.getByText('SOL · 42 rewards')).toBeInTheDocument()
		expect(screen.getByText('EURCV · 10 rewards')).toBeInTheDocument()
	})

	it('calls onClose when the dialog is closed', async () => {
		const onClose = vi.fn()
		render(<StakingRewardsDialog open onClose={onClose} year={2026} rewards={rewards} />)

		await fireEvent.click(screen.getByRole('button', { name: /close/i }))

		expect(onClose).toHaveBeenCalled()
	})

	it('renders no rows when closed', () => {
		render(<StakingRewardsDialog open={false} onClose={vi.fn()} year={2026} rewards={rewards} />)

		expect(screen.queryByText('SOL · 42 rewards')).not.toBeInTheDocument()
	})
})
