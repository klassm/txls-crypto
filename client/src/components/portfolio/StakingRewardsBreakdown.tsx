'use client'

import { Box, Stack, Typography } from '@mui/material'
import type { StakingRewardByAsset } from '../../lib/client/prices-api'
import { formatEur } from '../../lib/format'

export function StakingRewardsBreakdown({ rewards }: { rewards: StakingRewardByAsset[] }) {
	if (rewards.length === 0) return null

	return (
		<Stack spacing={0.5} sx={{ mt: 1.5 }}>
			{rewards.map((reward) => (
				<Box
					key={reward.asset}
					sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
				>
					<Typography variant="caption" color="text.secondary">
						{reward.asset} · {reward.count} reward{reward.count !== 1 ? 's' : ''}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						{formatEur(reward.eurValue)}
					</Typography>
				</Box>
			))}
		</Stack>
	)
}
