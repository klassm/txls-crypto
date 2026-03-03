import { Router, Request, Response } from "express";
import { getDataSource, UsersService, AUTH_COOKIE_NAME, generateToken, getSessionMaxAge, verifyToken, loginSchema, changePasswordSchema, config } from "@txls/shared";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const usersService = new UsersService(undefined, dataSource);

  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });
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

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict",
      maxAge: getSessionMaxAge() / 1000,
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
    return res.status(400).json({ error: validationResult.error.errors[0].message });
  }

  const { currentPassword, newPassword } = validationResult.data;

  const dataSource = await getDataSource();
  const usersService = new UsersService(undefined, dataSource);

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
