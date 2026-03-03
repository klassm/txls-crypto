import { Router, Request, Response } from "express";
import { getDataSource, ProvidersService, ProvidersRepository, TransactionsRepository, TransactionsService, toISOString } from "@txls/shared";
import { DateTime } from "luxon";
import { getUserIdFromRequest } from "../../utils/session.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  const providersService = new ProvidersService(undefined, dataSource);

  try {
    const providers = await providersService.findAll(userId);
    const serializedProviders = providers.map((p) => ({
      ...p,
      createdAt: toISOString(p.createdAt) ?? "",
      updatedAt: toISOString(p.updatedAt) ?? "",
    }));
    return res.json(serializedProviders);
  } catch (error) {
    console.error("Error fetching providers:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  try {
    const providerAccountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(providerAccountId)) {
      return res.status(400).json({ error: "Invalid provider account ID" });
    }

    const providersService = new ProvidersService(undefined, dataSource);
    const provider = await providersService.findById(userId, providerAccountId);

    if (!provider) {
      return res.status(404).json({ error: "Provider account not found" });
    }

    const serializedProvider = {
      ...provider,
      createdAt: toISOString(provider.createdAt) ?? "",
      updatedAt: toISOString(provider.updatedAt) ?? "",
    };

    return res.json(serializedProvider);
  } catch (error) {
    console.error("Error fetching provider:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  try {
    const providerAccountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(providerAccountId)) {
      return res.status(400).json({ error: "Invalid provider account ID" });
    }

    const providersService = new ProvidersService(undefined, dataSource);
    await providersService.delete(userId, providerAccountId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting provider:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.get("/:id/transactions", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  try {
    const providerAccountId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(providerAccountId)) {
      return res.status(400).json({ error: "Invalid provider account ID" });
    }

    const yearParam = req.query.year as string | undefined;
    const currentYear = DateTime.now().year;

    if (yearParam !== undefined) {
      const parsedYear = Number.parseInt(yearParam, 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > currentYear) {
        return res.status(400).json({ error: `Invalid year. Must be between 2000 and ${currentYear}` });
      }
    }

    const year = yearParam ? Number.parseInt(yearParam, 10) : currentYear;

    const providersRepository = new ProvidersRepository(dataSource);
    const providersService = new ProvidersService(providersRepository, dataSource);
    const provider = await providersService.findById(userId, providerAccountId);

    const transactionsRepository = new TransactionsRepository(dataSource);
    const transactionsService = new TransactionsService(transactionsRepository);

    const result = await transactionsService.findByProviderAccountIdWithStats(userId, providerAccountId, year);

    const availableYears = await transactionsRepository.getAvailableYears(userId, providerAccountId);

    const uniqueYears = new Set([currentYear, ...availableYears]);
    const sortedYears = Array.from(uniqueYears).sort((a, b) => b - a);

    const serializedTransactions = result.transactions.map((tx) => ({
      ...tx,
      timestamp: toISOString(tx.timestamp) ?? "",
    }));

    const serializedProvider = provider ? {
      ...provider,
      createdAt: toISOString(provider.createdAt) ?? "",
      updatedAt: toISOString(provider.updatedAt) ?? "",
    } : {
      id: providerAccountId,
      type: "" as any,
      csvImportAllowed: false,
      createdAt: toISOString(DateTime.now()) ?? "",
      updatedAt: toISOString(DateTime.now()) ?? "",
    };

    return res.json({
      provider: serializedProvider,
      transactions: serializedTransactions,
      stats: result.stats,
      availableYears: sortedYears,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

export default router;
