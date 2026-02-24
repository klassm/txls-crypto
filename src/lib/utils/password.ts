import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { config } from "@/server/config/env";

export const SALT_ROUNDS = 12;

export interface JwtPayload {
  userId: number;
  username: string;
  email: string;
  isAdmin: boolean;
}

export const AUTH_COOKIE_NAME = "auth_token";

function getJwtSecret(): string {
  if (!config.jwt.secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return config.jwt.secret;
}

export function generateToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: "1h",
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      isAdmin: decoded.isAdmin,
    };
  } catch {
    return null;
  }
}

export function getSessionMaxAge(): number {
  return 60 * 60 * 1000;
}