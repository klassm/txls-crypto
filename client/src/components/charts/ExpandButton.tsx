"use client";

import { OpenInFull } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";

interface ExpandButtonProps {
	onClick: () => void;
}

export function ExpandButton({ onClick }: ExpandButtonProps) {
	return (
		<Tooltip title="Expand chart">
			<IconButton size="small" onClick={onClick}>
				<OpenInFull fontSize="small" />
			</IconButton>
		</Tooltip>
	);
}
