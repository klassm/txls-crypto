import { Request } from "express";
import { AUTH_COOKIE_NAME, verifyToken, getTokenExpiration } from "./password.js";
import { config } from "../config/env.js";
import { logger } from "../common/logger.js";
import { getDataSource } from "../database.js";
import { getUsersService } from "../di/service-locator.js";
import cookie from "cookie";
import { HassSupervisorError } from "./errors.js";

export { AUTH_COOKIE_NAME, verifyToken, getTokenExpiration, config, logger, getDataSource };

export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  const authorization = req.headers.authorization || "";
  const hassToken = authorization.replace("Bearer ", "");
  const ingressUser = req.headers["x-ingress-path"] as string | undefined;
  const remoteUserId = req.headers["x-remote-user-id"] as string | undefined;
  const remoteUserName = req.headers["x-remote-user-name"] as string | undefined;
  const remoteUserDisplayName = req.headers["x-remote-user-display-name"] as string | undefined;
  const isHomeAssistantIngress = !!ingressUser && !!config.homeAssistant.supervisorToken;

  if (isHomeAssistantIngress) {
    const cookieUserId = getUserIdFromCookie(req);
    if (cookieUserId) {
      return cookieUserId;
    }
    
    if (remoteUserName || remoteUserId || remoteUserDisplayName) {
      return await getHomeAssistantUserIdFromHeaders(remoteUserName, remoteUserId, remoteUserDisplayName);
    }
    
    if (hassToken) {
      return await getHomeAssistantUserIdFromToken(hassToken);
    }
    
    return null;
  }

  if (hassToken) {
    return await getHomeAssistantUserIdFromToken(hassToken);
  }

  return getUserIdFromCookie(req);
}

async function getHomeAssistantUserIdFromHeaders(
  remoteUserName: string | undefined, 
  remoteUserId: string | undefined,
  remoteUserDisplayName: string | undefined
): Promise<number | null> {
  const { UsersService } = await import("../modules/users/users.service.js");
  
  const username = remoteUserName || remoteUserId || remoteUserDisplayName;
  
  if (!username) {
    logger.warn("No username from HASS headers");
    return null;
  }
  
  logger.info({ msg: "Getting user from HASS headers", remoteUserId, remoteUserName, remoteUserDisplayName, username });
  
  const usersService = getUsersService();
  
  let userEntity = await usersService.findByUsername(username);
  if (!userEntity) {
    logger.info({ msg: "Creating new user from HASS headers", username });
    const bcrypt = (await import("bcrypt")).default;
    const randomPassword = Array(32).fill(0).map(() => Math.random().toString(36)[2]).join("");

    userEntity = await usersService.createUser({
      name: username,
      username: username,
      email: username.includes("@") ? username : `${username}@hass.local`,
      password: randomPassword,
      isAdmin: false,
    });
  }

  logger.info({ msg: "User authenticated from headers", userId: userEntity.id });
  return userEntity.id;
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

export function getTokenExpirationFromCookie(req: Request): number | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookie.parse(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    return null;
  }

  return getTokenExpiration(token);
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

async function getHomeAssistantUserIdFromToken(token: string): Promise<number | null> {
  const { UsersService } = await import("../modules/users/users.service.js");

  const supervisorToken = config.homeAssistant.supervisorToken;
  logger.info({
    msg: "getHomeAssistantUserIdFromToken",
    hasSupervisorToken: !!supervisorToken,
    tokenLength: token.length,
  });

  if (!supervisorToken) {
    logger.warn("No supervisor token available");
    return null;
  }

  let response: Response;
  try {
    logger.info("Calling supervisor/auth...");
    response = await fetch("http://supervisor/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supervisorToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    logger.error({ msg: "Failed to connect to Home Assistant supervisor", error });
    throw new HassSupervisorError("Unable to connect to Home Assistant supervisor. Please check if Home Assistant is running.");
  }

  logger.info({ msg: "Supervisor response status", status: response.status });

  if (!response.ok) {
    logger.warn("Supervisor auth failed");
    return null;
  }

  let authData: { data?: { user?: { name?: string; is_owner?: boolean } } } | undefined;
  try {
    authData = await response.json() as { data?: { user?: { name?: string; is_owner?: boolean } } };
  } catch (error) {
    logger.error({ msg: "Failed to parse supervisor response", error });
    throw new HassSupervisorError("Invalid response from Home Assistant supervisor.");
  }
  
  if (!authData) {
    logger.warn("No auth data in response");
    return null;
  }
  
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

  const usersService = getUsersService();

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
}
