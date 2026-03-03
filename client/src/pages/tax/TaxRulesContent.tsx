"use client";

import {
  Box,
  Container,
  Typography,
  Stack,
  Paper,
  Divider,
  Link as MuiLink,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/common/PageHeader";

const rules = [
  {
    title: "Legal Classification",
    content: `Cryptocurrencies are classified as "sonstige Wirtschaftsgüter" (other economic goods) under § 23 EStG, similar to collectibles like art, wine, or gold.`,
  },
  {
    title: "One-Year Holding Period (Einjährige Haltefrist)",
    content: `Gains from crypto sales are 100% tax-free if held for more than 1 year from the acquisition date (§ 23 Abs. 1 Nr. 2 S. 1 EStG). This applies to all disposal events including sales, swaps, and spending.`,
  },
  {
    title: "€1,000 Exemption Threshold (Freigrenze) for Capital Gains",
    content: `Total gains under €1,000 per year are tax-free. This is a Freigrenze (all-or-nothing threshold): if exceeded, the entire amount (not just the excess) becomes taxable. Applies to gains from sales within the 1-year holding period.`,
  },
  {
    title: "€256 Exemption Threshold (Freigrenze) for Staking/Mining Income",
    content: `Income from staking, mining, lending, and airdrops under €256 total per year is tax-free. Falls under § 22 Nr. 3 EStG as "sonstige Leistungen" (other services). If exceeded, the entire amount is taxable at your personal income tax rate.`,
  },
  {
    title: "Transfers Between Own Accounts (Wallet-Transfers)",
    content: `Moving crypto between your own wallets or exchange accounts is tax-free and does not trigger a taxable event. The original acquisition date and cost basis are preserved for the 1-year holding period calculation.

Important: Individual exchange tax reports often incorrectly reset the holding period when crypto is transferred in. This system matches transfers across all your accounts to preserve the correct acquisition date for German tax compliance.`,
  },
  {
    title: "Loss Carryover (Verlustvortrag)",
    content: `Losses from crypto trading can be carried forward indefinitely to offset future taxable gains. For example, losses from 2024 can offset gains in 2025, 2026, and beyond until fully used.`,
  },
  {
    title: "Progressive Tax Rate",
    content: `Taxable crypto gains are taxed at your personal income tax rate (0-45%) under the progressive German tax system, based on your total taxable income. The rate depends on your income bracket.`,
  },
];

const docRequirements = [
  "Every transaction must be individually documented",
  "Required info: date, asset type and quantity, EUR conversion, wallet address/platform, usage order (FIFO)",
  "Acceptable proofs: exchange reports, blockchain explorers, wallet backups, certified tax software reports",
  "Unclaimed but economically available staking rewards are taxable by 31.12. of each year",
  "Additional 6-year documentation retention for gains exceeding €500,000 (from 2027: €750,000)",
];

export function TaxRulesContent() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <PageHeader
          title="German Crypto Tax Rules"
          onBack={() => navigate("/tax")}
          backButtonLabel="Back to Tax Calculations"
        />

        <Typography variant="body1" color="text.secondary">
          Understanding German cryptocurrency taxation rules and regulations for private investors.
        </Typography>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={3}>
            {rules.map((rule, index) => (
              <Box key={index}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {rule.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                  {rule.content}
                </Typography>
                {index < rules.length - 1 && <Divider sx={{ mt: 3 }} />}
              </Box>
            ))}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Documentation Requirements (2025+)
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Starting from 2025, stricter documentation requirements apply (BMF Schreiben March 2025):
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
            {docRequirements.map((req, index) => (
              <Typography key={index} variant="body2" color="text.secondary" component="li" sx={{ mb: 0.5 }}>
                {req}
              </Typography>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Sources & Further Reading
          </Typography>
          <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              <MuiLink href="https://www.bmf-steuerrechner.de" target="_blank" rel="noopener">
                BMF Steuerrechner (Official Tax Calculator)
              </MuiLink>
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              <MuiLink href="https://www.gesetze-im-internet.de/estg/__23.html" target="_blank" rel="noopener">
                § 23 EStG (Private Sales Transactions)
              </MuiLink>
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              <MuiLink href="https://www.blockpit.io/de-de/steuer-guides/krypto-steuer-deutschland" target="_blank" rel="noopener">
                Blockpit: Krypto Steuer Deutschland Guide
              </MuiLink>
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              <MuiLink href="https://koinly.io/de/guides/crypto-tax-germany/" target="_blank" rel="noopener">
                Koinly: German Crypto Tax Guide
              </MuiLink>
            </Typography>
          </Stack>
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", display: "block" }}>
          This information is for educational purposes only. Always verify tax calculations with official sources or a tax professional.
        </Typography>
      </Stack>
    </Container>
  );
}
