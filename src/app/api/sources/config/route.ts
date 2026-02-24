import { NextResponse } from "next/server";
import { ProviderType } from "@/lib/types";
import { sources } from "@/server/sources/registry";

const providerRegistryMapping: Record<string, ProviderType> = {
  bitpanda: ProviderType.Bitpanda,
  tradeRepublic: ProviderType.TradeRepublic,
};

export async function GET() {
  return NextResponse.json(
    Object.entries(sources).map(([key, value]) => ({
      source: providerRegistryMapping[key] || (key as ProviderType),
      name: value.name,
      logoBackgroundColor: value.logoBackgroundColor,
      logoForegroundColor: value.logoForegroundColor,
      logoPath: value.logoPath,
      csvImportMarkdownInstructions: value.csvImportMarkdownInstructions,
      csvImportAllowed: value.csvImporter !== undefined,
    })),
  );
}