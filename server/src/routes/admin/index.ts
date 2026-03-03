import { Router, Request, Response } from "express";
import { getDataSource, UsersService, AUTH_COOKIE_NAME, verifyToken, userSchema, updateUserSchema, resetPasswordSchema } from "@txls/shared";
import { getUserIdFromRequest } from "../../utils/session.js";

const router = Router();

router.get("/users", async (req: Request, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const dataSource = await getDataSource();
  const service = new UsersService(undefined, dataSource);
  const users = await service.findAll();

  return res.json(users);
});

router.post("/users", async (req: Request, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const parsed = userSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });
    }

    const dataSource = await getDataSource();
    const service = new UsersService(undefined, dataSource);

    const user = await service.createUser(parsed.data);
    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.get("/users/:id", async (req: Request, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const userId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const dataSource = await getDataSource();
    const service = new UsersService(undefined, dataSource);
    const user = await service.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.put("/users/:id", async (req: Request, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const userId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const parsed = updateUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });
    }

    const dataSource = await getDataSource();
    const service = new UsersService(undefined, dataSource);
    const user = await service.updateUser(userId, parsed.data);

    return res.json(user);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const userId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (userId === payload.userId) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    const dataSource = await getDataSource();
    const service = new UsersService(undefined, dataSource);
    await service.deleteUser(userId);

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

router.post("/users/:id/password", async (req: Request, res: Response) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dataSource = await getDataSource();
  const service = new UsersService(undefined, dataSource);
  const adminUser = await service.findById(userId);

  if (!adminUser || !adminUser.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const targetUserId = Number.parseInt(req.params.id as string, 10);

    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (userId === targetUserId) {
      return res.status(400).json({ error: "Cannot reset your own password via this endpoint" });
    }

    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    await service.updatePassword(Number.parseInt(req.params.id as string, 10), parsed.data.newPassword);

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
