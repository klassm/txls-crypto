import { Router, Request, Response } from "express";
import { ProviderType } from "@txls/shared";
import { sources } from "../../sources/registry.js";

const router = Router();

router.get("/config", (_req: Request, res: Response) => {
	return res.json(
		Object.entries(sources).map(([key, value]) => ({
			source: key as ProviderType,
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
