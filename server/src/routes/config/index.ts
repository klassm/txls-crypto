import { Router, Request, Response } from "express";
import { getDataSource } from "../../database.js";
import { UsersService } from "../../modules/users/users.service.js";
import { AUTH_COOKIE_NAME, generateToken, getSessionMaxAge, verifyToken } from "../../utils/password.js";
import { toISOString } from "../../utils/date.js";
import { onboardingUserSchema } from "../../validation/schemas.js";
import { config } from "../../config/env.js";
import { getUserIdFromRequest } from "../../utils/session.js";
import { logger } from "../../common/logger.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const ingressPath = req.headers["x-ingress-path"] as string | undefined;
  const authorization = req.headers.authorization;
  const hassIngress = !!ingressPath && !!config.homeAssistant.supervisorToken;

  logger.info({
    msg: "GET /api/config",
    ingressPath,
    hassIngress,
    hasAuthorization: !!authorization,
    hasSupervisorToken: !!config.homeAssistant.supervisorToken,
    allHeaders: Object.keys(req.headers).reduce((acc, key) => {
      if (key.startsWith('x-') || key === 'authorization' || key === 'cookie') {
        acc[key] = req.headers[key];
      }
      return acc;
    }, {} as Record<string, unknown>),
  });

  try {
    const dataSource = await getDataSource();
    const usersService = new UsersService(undefined, dataSource);
    const existingUsersCount = await usersService.count();

    let user = null;
    const userId = await getUserIdFromRequest(req);

    logger.info({ msg: "User ID", userId });

    if (userId) {
      user = await usersService.findById(userId);
      if (user) {
        user = {
          ...user,
          createdAt: toISOString(user.createdAt) ?? "",
          updatedAt: toISOString(user.updatedAt) ?? "",
        };
      }
    }

    logger.info({ 
      msg: "Returning user", 
      user: user ? { id: user.id, username: user.username } : null 
    });

    return res.json({
      canOnboard: existingUsersCount === 0,
      user,
      hassIngress,
    });
  } catch (error) {
    logger.error({ msg: "Error in /api/config", error });
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/onboard", async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const usersService = new UsersService(undefined, dataSource);

  const existingUsersCount = await usersService.count();

  if (existingUsersCount > 0) {
    if (req.cookies?.[AUTH_COOKIE_NAME]) {
      return res.status(403).json({ error: "Onboarding is only available when no users exist in the DB" });
    }

    return res.status(400).json({ error: "Users already exist. Onboarding is not available." });
  }

  const validationResult = onboardingUserSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ error: validationResult.error.errors[0].message });
  }

  const user = await usersService.createOnboardingUser(validationResult.data);

  const token = generateToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
  });

  const serializedUser = {
    ...user,
    createdAt: toISOString(user.createdAt) ?? "",
    updatedAt: toISOString(user.updatedAt) ?? "",
  };

  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure = forwardedProto === "https" || req.secure;
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" : "lax",
    maxAge: getSessionMaxAge(),
    path: "/",
  });

  return res.status(201).json({
    canOnboard: false,
    user: serializedUser,
  });
});

export default router;
