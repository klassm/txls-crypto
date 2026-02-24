import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { UsersService } from "@/server/modules/users/users.service";
import { AUTH_COOKIE_NAME, getSessionMaxAge, generateToken } from "@/lib/utils/password";
import { loginSchema } from "@/lib/validation/schemas";
import { config } from "@/server/config/env";

export async function POST(request: Request) {
  const dataSource = await getDataSource();
  const usersService = new UsersService(undefined, dataSource);

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { username, password } = parsed.data;

    const userEntity = await usersService.verifyPassword(username, password);

    if (!userEntity) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const token = generateToken({
      userId: userEntity.id,
      username: userEntity.username,
      email: userEntity.email,
      isAdmin: userEntity.isAdmin,
    });

    const response = NextResponse.json({
      user: {
        id: userEntity.id,
        name: userEntity.name,
        username: userEntity.username,
        email: userEntity.email,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict",
      maxAge: getSessionMaxAge() / 1000,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error logging in:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}