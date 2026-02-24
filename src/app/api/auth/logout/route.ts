import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/utils/password";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out successfully" });

  response.cookies.delete(AUTH_COOKIE_NAME);

  return response;
}