import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { UsersService } from "@/server/modules/users/users.service";
import { getUserIdFromRequest } from "@/lib/utils/session";
import { changePasswordSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const validationResult = changePasswordSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: validationResult.error.errors[0].message },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = validationResult.data;

  const dataSource = await getDataSource();
  const usersService = new UsersService(undefined, dataSource);

  try {
    const user = await usersService.findById(userId);
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const passwordMatch = await usersService.verifyPassword(
      user.username,
      currentPassword,
    );

    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    await usersService.updatePassword(userId, newPassword);

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}