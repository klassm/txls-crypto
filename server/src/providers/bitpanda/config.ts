import type { ProviderConfig } from "../types.js";
import { BitpandaImporter } from "./importer.js";
import { BitpandaApiClient } from "./api-client.js";

export const bitpandaConfig: ProviderConfig = {
  csvImporter: new BitpandaImporter(),
  apiClient: new BitpandaApiClient(),
  name: "Bitpanda",
  logoBackgroundColor: "#27D17F",
  logoForegroundColor: "#ffffff",
  logoPath: "/assets/bitpanda.svg",
  csvImportMarkdownInstructions: `# Bitpanda CSV Import Instructions

1. Log in to your Bitpanda account
2. Go to **Overview** → **Trade History**
3. Click on the download icon (CSV)
4. Select the desired date range
5. Download the CSV file
6. Import the file into this application

**Note:** The file should contain all transaction types including buys, sells, deposits, withdrawals, and staking rewards.`,
  apiSyncMarkdownInstructions: `# Bitpanda API Sync Setup

1. Log in to your Bitpanda account
2. Go to **Settings** → **API**
3. Click **Create new API key**
4. Enter a name for your API key (e.g., "TXLS Tax App")
5. **Important:** Select only the following permissions:
   - **Read** (required for transaction history)
   - Do NOT enable **Trade** or **Withdraw** permissions
6. Complete the 2FA verification
7. Copy the API key and paste it below

**Security Notes:**
- The API key is stored encrypted in the database
- Only read access is needed for transaction import
- Never share your API key with others
- You can revoke the API key at any time in your Bitpanda settings

**What gets synced:**
- All trades (buys, sells)
- Crypto deposits and withdrawals
- Fiat deposits and withdrawals
- Staking rewards
- Commodity transactions (gold, silver, etc.)`,
};