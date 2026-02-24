"use client";

import {
  Download,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Info,
  AccountBalance,
  ArrowForward,
  OpenInNew,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  CircularProgress,
  Alert,
  Link as MuiLink,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import type { TaxTransaction } from "@/lib/types";
import { green, red, grey } from "@mui/material/colors";
import { useExportTaxCsv } from "../hooks/useAccountMutations";
import { useCombinedTaxCalculations } from "../hooks/useCombinedTaxCalculations";
import { PageHeader } from "../components/common/PageHeader";
import { PageLayout } from "../components/common/PageLayout";
import { DateTime } from "luxon";
import type { ReactElement } from "react";

interface MetricCardProps {
  label: string;
  tooltip: ReactElement;
  value: string;
  valueColor: string;
  icon: ReactElement;
}

function MetricCard({ label, tooltip, value, valueColor, icon }: MetricCardProps) {
  return (
    <Card sx={{ flex: 1, minWidth: 300 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold" textTransform="uppercase">
              {label}
            </Typography>
            <Tooltip title={tooltip} arrow>
              {icon}
            </Tooltip>
          </Stack>
          <Typography variant="h4" color={valueColor} sx={{ fontWeight: "bold" }}>
            {value}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function TaxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentYear = DateTime.now().year;
  const queryYear = searchParams.get("year");
  const selectedYear = queryYear ? Number.parseInt(queryYear, 10) : currentYear;

  const handleYearChange = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", year.toString());
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const yearOptions = Array.from(
    { length: currentYear - 2019 + 1 },
    (_, i) => currentYear - i,
  );

  const exportMutation = useExportTaxCsv(1);

  const handleExportCsv = () => {
    exportMutation.mutate(selectedYear);
  };

  const { data, isLoading, isError, error } = useCombinedTaxCalculations(selectedYear);

  return (
    <PageLayout>
      <Stack spacing={3}>
        <PageHeader
          title="Tax Calculations"
          onBack={() => router.push("/")}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          yearOptions={yearOptions}
          showYearLabel
        />

      {isError && (
        <Box>
          <Typography color="error">
            {error instanceof Error ? error.message : "Failed to load tax data"}
          </Typography>
        </Box>
      )}

      {isLoading && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <>
          <Stack direction="row" spacing={2}>
            <MetricCard
              label="Taxable Gains"
              tooltip={
                <Box sx={{ p: 1, maxWidth: 400 }}>
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Taxable Gains Explanation
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Total gains from cryptocurrency sales that are subject to taxation after applying:
                  </Typography>
                  <Box sx={{ pl: 1.5 }}>
                    <Typography variant="body2">• Long-term holding exemption (held &gt;1 year)</Typography>
                    <Typography variant="body2">• €1,000 Freigrenze exemption for small gains</Typography>
                    <Typography variant="body2">• Loss carryover from previous years</Typography>
                  </Box>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                    Only short-term gains (≤365 days) above €1,000 total are taxable.
                  </Typography>
                </Box>
              }
              value={`+€${data.totalGain.toFixed(2)}`}
              valueColor={green[500]}
              icon={<TrendingUp sx={{ color: grey[600] }} />}
            />
            <MetricCard
              label="Taxable Losses"
              tooltip={
                <Box sx={{ p: 1, maxWidth: 400 }}>
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Taxable Losses Explanation
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Total losses from cryptocurrency sales that can be used to:
                  </Typography>
                  <Box sx={{ pl: 1.5 }}>
                    <Typography variant="body2">• Offset current year&apos;s taxable gains</Typography>
                    <Typography variant="body2">• Carry forward to future years (if not fully used)</Typography>
                  </Box>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                    German tax law allows unlimited loss carryforward to offset future gains.
                  </Typography>
                </Box>
              }
              value={`-€${data.totalLoss.toFixed(2)}`}
              valueColor={red[500]}
              icon={<TrendingDown sx={{ color: grey[600] }} />}
            />
            <MetricCard
              label="Net Taxable"
              tooltip={
                <Typography variant="caption" sx={{ maxWidth: 300 }}>
                  Taxable gains minus taxable losses (after applying all exemptions and loss carryover)
                </Typography>
              }
              value={`€${(data.totalGain - data.totalLoss).toFixed(2)}`}
              valueColor={data.totalGain - data.totalLoss >= 0 ? green[500] : red[500]}
              icon={<Info sx={{ color: grey[600] }} />}
            />
            <MetricCard
              label="Staking Rewards"
              tooltip={
                <Box sx={{ p: 1, maxWidth: 400 }}>
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Staking Rewards
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Sum of all staking reward transactions received during this tax year.
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Taxable if total &gt; €256 (Freigrenze - all-or-nothing threshold)
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                    Falls under § 22 EStG as "sonstige Leistungen" (other services)
                  </Typography>
                </Box>
              }
              value={`€${data.totalStakingRewards.toFixed(2)}`}
              valueColor={data.stakingRewardsExempt > 0 ? green[500] : red[500]}
              icon={<AccountBalance sx={{ color: grey[600] }} />}
            />
          </Stack>

          <Alert severity="info" sx={{ display: data.lossCarryover && data.lossCarryover.remaining > 0 ? "flex" : "none" }}>
            <Stack spacing={1}>
              <Typography variant="body1" fontWeight="bold">
                Loss Carryover Detected
              </Typography>
              <Typography variant="body2">
                {data.lossCarryover && data.lossCarryover.year && (
                  <>
                    <strong>{data.lossCarryover.year}</strong>:{" "}
                  </>
                )}
                {data.lossCarryover && data.lossCarryover.loss > 0 && (
                  <>€{data.lossCarryover.loss.toFixed(2)} losses carried over - </>
                )}
                {data.lossCarryover && data.lossCarryover.loss > 0 && data.lossCarryover.remaining < data.lossCarryover.loss && (
                  <>€{(data.lossCarryover.loss - data.lossCarryover.remaining).toFixed(2)} used this year - </>
                )}
                {data.lossCarryover && (
                  <>
                    <strong>€{data.lossCarryover.remaining.toFixed(2)} remaining</strong> to offset future gains
                  </>
                )}
              </Typography>
            </Stack>
          </Alert>

          <Paper>
            <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="h6">Tax Transactions ({data.transactions.length})</Typography>
                {data.includedAccounts && data.includedAccounts.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    All accounts: {data.includedAccounts.map((a) => a.source).join(" + ")}
                  </Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={handleExportCsv}
                disabled={exportMutation.isPending || data.transactions.length === 0}
              >
                {exportMutation.isPending ? "Downloading..." : "WISO Export"}
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Asset</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Price (€)</TableCell>
                      <TableCell align="right">Fee (€)</TableCell>
                      <TableCell align="right">Cost Basis (€)</TableCell>
                      <TableCell align="right">Proceeds (€)</TableCell>
                      <TableCell align="right">Gain/Loss (€)</TableCell>
                      <TableCell align="right">Holding Period</TableCell>
                      <TableCell>Tax Status</TableCell>
                    </TableRow>
                  </TableHead>
                <TableBody>
                  {data.transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No taxable transactions for this year
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.transactions.map((tx, index) => {
                      const txDate = typeof tx.date === "string" ? DateTime.fromISO(tx.date) : tx.date;
                      return (
                        <TableRow key={index} hover sx={{
                          opacity: tx.isTaxFree ? 0.6 : 1,
                        }}>
                          <TableCell>{txDate.toFormat("dd.MM.yyyy")}</TableCell>
                          <TableCell>{tx.asset}</TableCell>
                          <TableCell align="right">{tx.quantity.toFixed(8)}</TableCell>
                          <TableCell align="right">{tx.pricePerUnit.toFixed(2)}</TableCell>
                          <TableCell align="right">{tx.fee.toFixed(2)}</TableCell>
                          <TableCell align="right">{tx.costBasis.toFixed(2)}</TableCell>
                          <TableCell align="right">{tx.proceeds.toFixed(2)}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              color: tx.gainLoss >= 0 ? green[500] : red[500],
                              fontWeight: "bold",
                            }}
                          >
                            {tx.gainLoss >= 0 ? "+" : ""}
                            {tx.gainLoss.toFixed(2)}
                          </TableCell>
                          <TableCell align="right">
                            {tx.holdingPeriodDays ? `${tx.holdingPeriodDays} days` : "-"}
                          </TableCell>
                          <TableCell>
                            {tx.isTaxFree ? (
                              tx.exemptionReason === "long_term_holding" ? (
                                <Tooltip title="Tax-free: Held for more than 1 year">
                                  <Chip
                                    icon={<CheckCircle />}
                                    label="Tax-Free"
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                  />
                                </Tooltip>
                              ) : tx.exemptionReason === "exemption_limit_1000" ? (
                                <Tooltip title="Tax-free: Total gains under €1,000 Freigrenze (all-or-nothing threshold - if exceeded, entire amount becomes taxable)">
                                  <Chip
                                    icon={<Info />}
                                    label="€1,000 Freigrenze"
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                  />
                                </Tooltip>
                              ) : tx.exemptionReason === "exemption_limit_256_staking" ? (
                                <Tooltip title="Tax-free: Staking rewards under €256 Freigrenze (all-or-nothing threshold - if exceeded, entire amount becomes taxable)">
                                  <Chip
                                    icon={<Info />}
                                    label="€256 Freigrenze"
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                  />
                                </Tooltip>
                              ) : (
                                <Chip label="Exempt" size="small" color="success" variant="outlined" />
                              )
                            ) : (
                              <Chip label="Taxable" size="small" color="default" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Need help understanding German crypto tax rules?
                </Typography>
              </Box>
              <Button
                component={Link}
                href="/tax/rules"
                endIcon={<OpenInNew />}
                size="small"
              >
                View Tax Rules
              </Button>
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
    </PageLayout>
  );
}