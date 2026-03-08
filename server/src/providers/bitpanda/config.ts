import type { ProviderConfig } from "../types.js";
import { BitpandaImporter } from "./importer.js";

export const bitpandaConfig: ProviderConfig = {
  csvImporter: new BitpandaImporter(),
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
};