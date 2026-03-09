import { Router, Request, Response } from "express";
import { getDataSource } from "../../database.js";
import { PortfolioSnapshotsService } from "../../modules/portfolio-snapshots/index.js";
import { getUserIdFromRequest } from "../../utils/session.js";

const router = Router();

router.get("/overview", async (req: Request, res: Response) => {
	const userId = await getUserIdFromRequest(req);
	if (!userId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const daysParam = req.query.days as string | undefined;
	const days = daysParam ? Number.parseInt(daysParam, 10) : 30;

	if (Number.isNaN(days) || days < 1 || days > 365) {
		return res.status(400).json({ error: "Days must be between 1 and 365" });
	}

	const dataSource = await getDataSource();
	const service = new PortfolioSnapshotsService(dataSource);

	const overview = await service.getPortfolioOverview(userId, days);

	return res.json(overview);
});

export default router;
