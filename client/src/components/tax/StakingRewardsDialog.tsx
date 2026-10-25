'use client'

import { Close } from '@mui/icons-material'
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material'
import type { StakingRewardByAsset } from '../../lib/client/prices-api'
import { StakingRewardsBreakdown } from '../portfolio/StakingRewardsBreakdown'

interface StakingRewardsDialogProps {
	open: boolean
	onClose: () => void
	year: number
	rewards: StakingRewardByAsset[]
}

export function StakingRewardsDialog({ open, onClose, year, rewards }: StakingRewardsDialogProps) {
	return (
		<Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
			<DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
				Staking Rewards by Asset ({year})
				<IconButton aria-label="close" onClick={onClose} size="small">
					<Close fontSize="small" />
				</IconButton>
			</DialogTitle>
			<DialogContent>
				<StakingRewardsBreakdown rewards={rewards} />
			</DialogContent>
		</Dialog>
	)
}
