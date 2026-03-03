import { Router, Request, Response } from "express";
import { AUTH_COOKIE_NAME, verifyToken } from "@txls/shared";
import { getUserIdFromRequest } from "../../utils/session.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.json({ isAuthenticated: false });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return res.json({ isAuthenticated: false });
  }

  return res.json({
    isAuthenticated: true,
    user: {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      isAdmin: payload.isAdmin,
    },
    permissions: {
      canManageUsers: payload.isAdmin,
      canViewAllAccounts: payload.isAdmin,
      canExport: true,
    },
  });
});

export default router;
