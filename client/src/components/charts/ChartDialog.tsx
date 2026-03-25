"use client";

import { Close } from "@mui/icons-material";
import {
	Dialog,
	DialogTitle,
	DialogContent,
	IconButton,
	ToggleButtonGroup,
	ToggleButton,
	Box,
	useTheme,
} from "@mui/material";
import { useState, useEffect } from "react";

export type TimeSpan = 7 | 30 | 90 | 180 | 365 | "all";

interface ChartDialogProps {
	open: boolean;
	onClose: () => void;
	title: string;
	initialTimeSpan?: TimeSpan;
	onTimeSpanChange: (timeSpan: TimeSpan) => void;
	children: React.ReactNode;
}

const TIME_SPAN_OPTIONS: { value: TimeSpan; label: string }[] = [
	{ value: 7, label: "7d" },
	{ value: 30, label: "30d" },
	{ value: 90, label: "90d" },
	{ value: 180, label: "180d" },
	{ value: 365, label: "1y" },
	{ value: "all", label: "All" },
];

export function ChartDialog({
	open,
	onClose,
	title,
	initialTimeSpan = 30,
	onTimeSpanChange,
	children,
}: ChartDialogProps) {
	const theme = useTheme();
	const [timeSpan, setTimeSpan] = useState<TimeSpan>(initialTimeSpan);

	useEffect(() => {
		if (open) {
			setTimeSpan(initialTimeSpan);
		}
	}, [open, initialTimeSpan]);

	const handleTimeSpanChange = (_: React.MouseEvent<HTMLElement>, newValue: TimeSpan | null) => {
		if (newValue !== null) {
			setTimeSpan(newValue);
			onTimeSpanChange(newValue);
		}
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="lg"
			fullWidth
			PaperProps={{
				sx: { height: "80vh" },
			}}
		>
			<DialogTitle>
				<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					{title}
					<IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
						<Close />
					</IconButton>
				</Box>
			</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
					<ToggleButtonGroup
						value={timeSpan}
						exclusive
						onChange={handleTimeSpanChange}
						size="small"
						sx={{
							"& .MuiToggleButton-root": {
								px: 2,
								"&.Mui-selected": {
									backgroundColor: theme.palette.primary.main,
									color: theme.palette.primary.contrastText,
									"&:hover": {
										backgroundColor: theme.palette.primary.dark,
									},
								},
							},
						}}
					>
						{TIME_SPAN_OPTIONS.map((option) => (
							<ToggleButton key={option.value} value={option.value}>
								{option.label}
							</ToggleButton>
						))}
					</ToggleButtonGroup>
				</Box>
				<Box sx={{ height: "calc(100% - 60px)" }}>{children}</Box>
			</DialogContent>
		</Dialog>
	);
}
