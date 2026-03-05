import { Request } from "express";
import { AUTH_COOKIE_NAME, verifyToken } from "./password.js";
import { config } from "../config/env.js";
import { logger } from "../common/logger.js";
import { getDataSource } from "../database.js";
import cookie from "cookie";

export { AUTH_COOKIE_NAME, verifyToken, config, logger, getDataSource };

export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  const authorization = req.headers.authorization || "";
  const hassToken = authorization.replace("Bearer ", "");
  const ingressUser = req.headers["x-ingress-path"] as string | undefined;
  const isHomeAssistantIngress = !!ingressUser && !!config.homeAssistant.supervisorToken;

  logger.info({ 
    msg: "getUserIdFromRequest",
    hasAuthorization: !!authorization,
    hasIngressPath: !!ingressUser,
    hasSupervisorToken: !!config.homeAssistant.supervisorToken,
    isHomeAssistantIngress,
  });

  if (isHomeAssistantIngress && hassToken) {
    return await getHomeAssistantUserId(req, hassToken);
  }

  return getUserIdFromCookie(req);
}

export function getUserIdFromCookie(req: Request): number | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookie.parse(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  return payload.userId;
}

export function getUserIdFromCookieExpress(req: { headers: { cookie?: string } }): number | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookie.parse(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  return payload.userId;
}

async function getHomeAssistantUserId(_req: Request, token: string): Promise<number | null> {
  const { UsersService } = await import("../modules/users/users.service.js");

  try {
    const supervisorToken = config.homeAssistant.supervisorToken;
    logger.info({ 
      msg: "getHomeAssistantUserId",
      hasSupervisorToken: !!supervisorToken,
      tokenLength: token.length,
    });

    if (!supervisorToken) {
      logger.warn("No supervisor token available");
      return null;
    }

    logger.info("Calling supervisor/auth...");
    const response = await fetch("http://supervisor/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supervisorToken}`,
      },
      body: JSON.stringify({ token }),
    });

    logger.info({ msg: "Supervisor response status", status: response.status });

    if (!response.ok) {
      logger.warn("Supervisor auth failed");
      return null;
    }

    const authData = (await response.json()) as { data?: { user?: { name?: string; is_owner?: boolean } } };
    logger.debug({ 
      msg: "Auth data",
      data: JSON.stringify(authData).substring(0, 200),
    });

    const userData = authData.data?.user;
    if (!userData?.name) {
      logger.warn("No user data in response");
      return null;
    }

    logger.info({ msg: "User found", name: userData.name, is_owner: userData.is_owner });

    const dataSource = await getDataSource();
    const usersService = new UsersService(undefined, dataSource);

    let userEntity = await usersService.findByUsername(userData.name);
    if (!userEntity) {
      logger.info({ msg: "Creating new user", name: userData.name });
      const bcrypt = (await import("bcrypt")).default;
      const randomPassword = Array(32).fill(0).map(() => Math.random().toString(36)[2]).join("");

      userEntity = await usersService.createUser({
        name: userData.name,
        username: userData.name,
        email: userData.name.includes("@") ? userData.name : `${userData.name}@hass.local`,
        password: randomPassword,
        isAdmin: userData.is_owner || false,
      });
    }

    logger.info({ msg: "User authenticated", userId: userEntity.id });
    return userEntity.id;
  } catch (error) {
    logger.error({ msg: "Home Assistant auth error", error });
    return null;
  }
}
