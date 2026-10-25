import type { ProviderConfig } from '../types.js'
import { BitpandaApiClient } from './api-client.js'
import { BitpandaImporter } from './importer.js'

export const bitpandaConfig: ProviderConfig = {
	csvImporter: new BitpandaImporter(),
	apiClient: new BitpandaApiClient(),
	name: 'Bitpanda',
	logoBackgroundColor: '#27D17F',
	logoForegroundColor: '#ffffff',
	logoPath: '/assets/bitpanda.svg',
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
5. Select the following scopes: **Balances** and **Transaction** (read only — no trade or earn permissions needed)

**What gets synced:**
- All trades (buys, sells, swaps)
- Crypto deposits and withdrawals
- Staking rewards

**Note:** Rewards are valued at the daily price recorded from your own trades where available; rewards without a stored price for that day are imported with value 0 and can be corrected manually.`,
	supportsManualStaking: true,
}
