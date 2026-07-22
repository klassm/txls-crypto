"use client";

import { Add, Delete } from "@mui/icons-material";
import {
	Alert,
	Box,
	Button,
	Card,
	CardActions,
	CardContent,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	Grid,
	IconButton,
	InputLabel,
	MenuItem,
	Select,
	Stack,
	Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ProviderType } from "@txls/shared";
import { useAccounts, useCreateAccount, useDeleteAccount, useSources } from "../hooks";
import { ProviderIcon } from "../components/icons";
import { PageLayout } from "../components/common/PageLayout";

export default function AccountsPage() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const { data: accounts = [], isLoading, isError, error } = useAccounts();
	const { data: sources = [] } = useSources();
	const createMutation = useCreateAccount();
	const deleteMutation = useDeleteAccount();

	const existingSources = new Set(accounts.map((a) => a.provider));
	const availableSources = sources.filter((s) => !existingSources.has(s.source as ProviderType));
	const [accountType, setAccountType] = useState<ProviderType>(
		availableSources.length > 0 ? (availableSources[0].source as ProviderType) : ProviderType.TradeRepublic,
	);

	const handleCreate = () => {
		createMutation.mutate(
			{ provider: accountType },
			{
				onSuccess: () => {
					setOpen(false);
					const newAvailableSources = sources.filter(
						(s) => !new Set([...accounts, { provider: accountType }].map((a) => a.provider)).has(s.source as ProviderType),
					);
					setAccountType(newAvailableSources.length > 0 ? (newAvailableSources[0].source as ProviderType) : ProviderType.TradeRepublic);
				},
			},
		);
	};

	const handleDelete = (id: number, event: React.MouseEvent) => {
		event.stopPropagation();
		if (window.confirm("Are you sure you want to delete this account?")) {
			deleteMutation.mutate(id);
		}
	};

	return (
		<PageLayout maxWidth="lg">
			<Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 4 }}>
				<Typography variant="h4" component="h1">
					Accounts
				</Typography>
				{availableSources.length > 0 && (
					<Button
						variant="contained"
						startIcon={<Add />}
						onClick={() => setOpen(true)}
					>
						Add Account
					</Button>
				)}
			</Stack>

			{isError && (
				<Alert severity="error" sx={{ mt: 2 }}>
					{error instanceof Error ? error.message : "Failed to load accounts"}
				</Alert>
			)}

			<Grid container spacing={3}>
				{isLoading ? (
					<Grid size={{ xs: 12 }}>
						<Typography>Loading...</Typography>
					</Grid>
				) : (
					<>
						{accounts.length === 0 && (
							<Grid size={{ xs: 12 }}>
								<Typography color="text.secondary">
									No accounts found. Create your first account to get started.
								</Typography>
							</Grid>
						)}
						{accounts.map((account) => (
							<Grid size={{ xs: 12, sm: 6, md: 4 }} key={account.id}>
								<Card
									sx={{
										minHeight: 200,
										display: "flex",
										flexDirection: "column",
										cursor: "pointer",
									}}
									onClick={() => navigate(`/accounts/${account.id}`)}
								>
									<CardContent>
										<Box
											sx={{
												display: "flex",
												alignItems: "center",
												mb: 2,
											}}
										>
											<Box
												sx={{
													width: 48,
													height: 48,
													mr: 3,
													borderRadius: "50%",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													bgcolor: sources.find((s) => s.source === account.provider)?.logoBackgroundColor,
													overflow: "hidden",
												}}
											>
												<ProviderIcon provider={account.provider ?? ProviderType.TradeRepublic} width={40} height={40} />
											</Box>
											<Typography variant="h6">{sources.find((s) => s.source === account.provider)?.name}</Typography>
										</Box>
										{account.assets && account.assets.length > 0 ? (
											<Box
												sx={{
													display: "flex",
													flexWrap: "wrap",
													gap: 1,
													mt: 1,
												}}
											>
												{account.assets.map((asset) => (
													<Box
														key={asset.asset}
														sx={{
															px: 1,
															py: 0.5,
															borderRadius: 1,
															bgcolor: "action.hover",
															fontSize: "0.8rem",
															color: "text.secondary",
															border: "1px solid",
															borderColor: "divider",
														}}
													>
														{asset.asset}: {asset.amount.toFixed(4)}
													</Box>
												))}
											</Box>
										) : (
											<Typography
												variant="body2"
												color="text.disabled"
												sx={{ mt: 1 }}
											>
												No known assets. Empty account.
											</Typography>
										)}
									</CardContent>
									<CardActions sx={{ mt: "auto", pt: 0 }}>
										<Button variant="contained" size="small">
											View Details
										</Button>
									</CardActions>
									<Box sx={{ position: "relative" }}>
										<IconButton
											sx={{ position: "absolute", right: 8, bottom: 8 }}
											onClick={(e) => handleDelete(account.id, e)}
										>
											<Delete />
										</IconButton>
									</Box>
								</Card>
							</Grid>
						))}
						{availableSources.length > 0 && (
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<Card
									sx={{
										cursor: "pointer",
										border: "2px dashed",
										borderColor: "text.disabled",
										bgcolor: "action.hover",
										minHeight: 180,
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										justifyContent: "center",
									}}
									onClick={() => setOpen(true)}
								>
									<Box
										sx={{
											textAlign: "center",
											color: "text.secondary",
										}}
									>
										<Box
											sx={{
												width: 64,
												height: 64,
												borderRadius: "50%",
												bgcolor: "rgba(0,0,0,0.05)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												mx: "auto",
												mb: 2,
											}}
										>
											<Add sx={{ fontSize: 32 }} />
										</Box>
										<Typography variant="subtitle1">Add Account</Typography>
									</Box>
								</Card>
							</Grid>
						)}
					</>
				)}
			</Grid>

			<Dialog open={open} onClose={() => setOpen(false)}>
				<DialogTitle>Add New Account</DialogTitle>
				<DialogContent>
					<FormControl fullWidth sx={{ mt: 2 }}>
						<InputLabel>Platform</InputLabel>
						<Select
							value={accountType}
							label="Platform"
							onChange={(e) => setAccountType(e.target.value as ProviderType)}
						>
							{availableSources.map((source) => (
								<MenuItem key={source.source} value={source.source}>
									{source.name}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={handleCreate}>
						Create
					</Button>
				</DialogActions>
			</Dialog>
		</PageLayout>
	);
}
