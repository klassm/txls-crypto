import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { UsersService } from "@/server/modules/users/users.service";
import {
  AUTH_COOKIE_NAME,
  getSessionMaxAge,
  generateToken,
  verifyToken,
} from "@/lib/utils/password";
import { toISOString } from "@/lib/utils/date";
import { onboardingUserSchema } from "@/lib/validation/schemas";
import { config } from "@/server/config/env";
import { getUserIdFromRequest, getUserIdFromCookie } from "@/lib/utils/session";
import { logger } from "@/server/common/logger";
import type { CreateOnboardingUserDto } from "@/lib/types";

export async function GET(request: NextRequest) {
  const ingressPath = request.headers.get("x-ingress-path");
  const authorization = request.headers.get("authorization");
  const hassIngress = !!ingressPath && !!config.homeAssistant.supervisorToken;

  logger.info({
    msg: "GET /api/config",
    ingressPath,
    hassIngress,
    hasAuthorization: !!authorization,
    hasSupervisorToken: !!config.homeAssistant.supervisorToken,
  });

  try {
    const dataSource = await getDataSource();
    const usersService = new UsersService(undefined, dataSource);
    const existingUsersCount = await usersService.count();

    let user = null;
    let userId = await getUserIdFromCookie(request);

    if (!userId) {
      userId = await getUserIdFromRequest(request);
    }

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

    return NextResponse.json({
      canOnboard: existingUsersCount === 0,
      user,
      hassIngress,
    });
  } catch (error) {
    logger.error({ msg: "Error in /api/config", error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const dataSource = await getDataSource();
  const usersService = new UsersService(undefined, dataSource);

  const existingUsersCount = await usersService.count();

  if (existingUsersCount > 0) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split("=");
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      if (cookies[AUTH_COOKIE_NAME]) {
        return NextResponse.json(
          { error: "Onboarding is only available when no users exist in the DB" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      { error: "Users already exist. Onboarding is not available." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as CreateOnboardingUserDto;

  const validationResult = onboardingUserSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.errors[0].message },
      { status: 400 },
    );
  }

  const user = await usersService.createOnboardingUser(body);

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

  const response = NextResponse.json(
    {
      canOnboard: false,
      user: serializedUser,
    },
    { status: 201 },
  );

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict",
    maxAge: getSessionMaxAge() / 1000,
    path: "/",
  });

  return response;
}