import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { AccountsService } from "@/server/modules/accounts/accounts.service";
import { toISOString } from "@/lib/utils/date";
import { getUserIdFromRequest } from "@/lib/utils/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  try {
    const { id } = await params;
    const accountId = Number.parseInt(id, 10);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const accountsService = new AccountsService(undefined, dataSource);
    const account = await accountsService.findById(userId, accountId);

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const serializedAccount = {
      ...account,
      createdAt: toISOString(account.createdAt) ?? "",
      updatedAt: toISOString(account.updatedAt) ?? "",
    };

    return NextResponse.json(serializedAccount);
  } catch (error) {
    console.error("Error fetching account:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  try {
    const { id } = await params;
    const accountId = Number.parseInt(id, 10);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    const accountsService = new AccountsService(undefined, dataSource);
    await accountsService.delete(userId, accountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}