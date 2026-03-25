import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { getUsersService } from "../../di/service-locator.js";
import { AUTH_COOKIE_NAME, generateToken, getSessionMaxAge, verifyToken } from "../../utils/password.js";
import { loginSchema, changePasswordSchema } from "../../validation/schemas.js";
import { config } from "../../config/env.js";

const router = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== "production",
});

router.post("/login", loginRateLimiter, async (req: Request, res: Response) => {
  const usersService = getUsersService();

  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const { username, password } = parsed.data;

    const userEntity = await usersService.verifyPassword(username, password);

    if (!userEntity) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = generateToken({
      userId: userEntity.id,
      username: userEntity.username,
      email: userEntity.email,
      isAdmin: userEntity.isAdmin,
    });

    const response = {
      user: {
        id: userEntity.id,
        name: userEntity.name,
        username: userEntity.username,
        email: userEntity.email,
      },
    };

    const isHomeAssistant = !!config.homeAssistant.supervisorToken;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const isSecure = (isHomeAssistant && forwardedProto === "https") || req.secure;
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? "none" : "lax",
      maxAge: getSessionMaxAge(),
      path: "/",
    });

    return res.json(response);
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

router.post("/logout", async (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  return res.json({ message: "Logged out successfully" });
});

router.post("/change-password", async (req: Request, res: Response) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const validationResult = changePasswordSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ error: validationResult.error.issues[0].message });
  }

  const { currentPassword, newPassword } = validationResult.data;

  const usersService = getUsersService();

  try {
    const user = await usersService.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordMatch = await usersService.verifyPassword(user.username, currentPassword);

    if (!passwordMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    await usersService.updatePassword(userId, newPassword);

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

export default router;
