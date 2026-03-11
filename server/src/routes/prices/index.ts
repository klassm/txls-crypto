import { Router, Request, Response } from "express";
import { getDataSource } from "../../database.js";
import { PricesRepository } from "../../modules/prices/prices.repository.js";
import { getUserIdFromRequest } from "../../utils/session.js";
import { DateTime } from "luxon";

const router = Router();

router.get("/latest", async (req: Request, res: Response) => {
	const userId = await getUserIdFromRequest(req);
	if (!userId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const dataSource = await getDataSource();
	const repository = new PricesRepository(dataSource);

	const prices = await repository.getAllLatestPrices();

	const result: Record<string, { priceEur: number; fetchedAt: string }> = {};
	for (const [asset, entity] of prices) {
		result[asset] = {
			priceEur: Number(entity.priceEur),
			fetchedAt: entity.fetchedAt.toISO() || "",
		};
	}

	return res.json(result);
});

router.get("/:asset/history", async (req: Request, res: Response) => {
	const userId = await getUserIdFromRequest(req);
	if (!userId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const asset = req.params.asset as string;
	if (!asset) {
		return res.status(400).json({ error: "Asset parameter is required" });
	}

	const daysParam = req.query.days as string | undefined;
	const days = daysParam ? Number.parseInt(daysParam, 10) : 30;

	if (Number.isNaN(days) || days < 1 || days > 3650) {
		return res.status(400).json({ error: "Days must be between 1 and 3650" });
	}

	const dataSource = await getDataSource();
	const repository = new PricesRepository(dataSource);

	const endDate = DateTime.utc().endOf("day");
	const startDate = endDate.minus({ days }).startOf("day");

	const history = await repository.getPriceHistory(asset, startDate, endDate);

	return res.json(
		history.map((h) => ({
			date: h.date.toISODate() || "",
			priceEur: h.priceEur,
		}))
	);
});

router.get("/:asset/latest", async (req: Request, res: Response) => {
	const userId = await getUserIdFromRequest(req);
	if (!userId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const asset = req.params.asset as string;
	if (!asset) {
		return res.status(400).json({ error: "Asset parameter is required" });
	}

	const dataSource = await getDataSource();
	const repository = new PricesRepository(dataSource);

	const price = await repository.getLatestPrice(asset);

	if (!price) {
		return res.status(404).json({ error: "Price not found for asset" });
	}

	return res.json({
		asset: price.asset,
		priceEur: Number(price.priceEur),
		fetchedAt: price.fetchedAt.toISO() || "",
	});
});

export default router;
