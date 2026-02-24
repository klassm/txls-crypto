import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { AccountsService } from "@/server/modules/accounts/accounts.service";
import { toISOString } from "@/lib/utils/date";
import { getUserIdFromRequest } from "@/lib/utils/session";
import { providerSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  const accountsService = new AccountsService(undefined, dataSource);

  try {
    const accounts = await accountsService.findAll(userId);
    const serializedAccounts = accounts.map((acc) => ({
      ...acc,
      createdAt: toISOString(acc.createdAt) ?? "",
      updatedAt: toISOString(acc.updatedAt) ?? "",
    }));
    return NextResponse.json(serializedAccounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  const accountsService = new AccountsService(undefined, dataSource);

  try {
    const body = await request.json();

    const validationResult = providerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 },
      );
    }

    const account = await accountsService.create(userId, body);
    const serializedAccount = account ? {
      ...account,
      createdAt: toISOString(account.createdAt) ?? "",
      updatedAt: toISOString(account.updatedAt) ?? "",
    } : null;
    return NextResponse.json(serializedAccount, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
