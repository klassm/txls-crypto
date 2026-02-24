import { NextRequest, NextResponse } from "next/server";
import { UsersService } from "@/server/modules/users/users.service";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/utils/password";
import { getDataSource } from "@/lib/database";
import { userSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dataSource = await getDataSource();
  const service = new UsersService(undefined, dataSource);
  const users = await service.findAll();

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyToken(token);

  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = userSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const dataSource = await getDataSource();
    const service = new UsersService(undefined, dataSource);

    const user = await service.createUser(parsed.data);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}