import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/utils/password";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ isAuthenticated: false });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return NextResponse.json({ isAuthenticated: false });
  }

  return NextResponse.json({
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
}