import { Router, Request, Response } from "express";
import { ProviderType, sources } from "@txls/shared";

const router = Router();

const providerRegistryMapping: Record<string, ProviderType> = {
  bitpanda: ProviderType.Bitpanda,
  tradeRepublic: ProviderType.TradeRepublic,
};

router.get("/config", (_req: Request, res: Response) => {
  return res.json(
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
});

export default router;
