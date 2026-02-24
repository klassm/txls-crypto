import { NextRequest, NextResponse } from "next/server";
import { UsersService } from "@/server/modules/users/users.service";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/utils/password";
import { getDataSource } from "@/lib/database";
import { resetPasswordSchema } from "@/lib/validation/schemas";
import { getUserIdFromRequest } from "@/lib/utils/session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  const service = new UsersService(undefined, dataSource);
  const adminUser = await service.findById(userId);

  if (!adminUser || !adminUser.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const targetUserId = Number.parseInt(id, 10);

    if (isNaN(targetUserId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    if (userId === targetUserId) {
      return NextResponse.json(
        { error: "Cannot reset your own password via this endpoint" },
        { status: 400 },
      );
    }

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    await service.updatePassword(Number.parseInt(id, 10), parsed.data.newPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}