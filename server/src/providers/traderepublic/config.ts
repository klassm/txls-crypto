import type { ProviderConfig } from "../types.js";
import { TradeRepublicImporter } from "./importer.js";

export const traderepublicConfig: ProviderConfig = {
  csvImporter: new TradeRepublicImporter(),
  apiClient: undefined,
  name: "TradeRepublic",
  logoBackgroundColor: "#ffffff",
  logoForegroundColor: "#000000",
  logoPath: "/assets/traderepublic.svg",
  csvImportMarkdownInstructions: `# TradeRepublic CSV Import

## Overview

You can import your TradeRepublic transactions using the [pytr](https://github.com/pytr-org/pytr) tool, which exports your transaction data to CSV format.

## Prerequisites

- Python installed on your machine
- [pytr](https://github.com/pytr-org/pytr) installed
- Your TradeRepublic account credentials

## Export Transactions

1. Install pytr:
   \`\`\`bash
   pip install pytr
   \`\`\`

2. Export your transactions to CSV:
   \`\`\`bash
   pytr export_transactions
   \`\`\`

3. This will generate an \`account_transactions.csv\` file in your current directory.

 ## Import
 
 Upload the \`account_transactions.csv\` file to import your TradeRepublic transactions.

**Important:** 
- Staking rewards are not included in the CSV export. Add them manually using the "Add Staking" button.
- Crypto transfers do not have a proper amount and will not show up properly!
`,
  apiSyncMarkdownInstructions: "",
  supportsManualStaking: true,
};
