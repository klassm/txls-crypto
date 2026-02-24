import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { ProvidersService } from "@/server/modules/providers/providers.service";
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
    const providerAccountId = Number.parseInt(id, 10);

    if (isNaN(providerAccountId)) {
      return NextResponse.json({ error: "Invalid provider account ID" }, { status: 400 });
    }

    const providersService = new ProvidersService(undefined, dataSource);
    const provider = await providersService.findById(userId, providerAccountId);

    if (!provider) {
      return NextResponse.json(
        { error: "Provider account not found" },
        { status: 404 }
      );
    }

    const serializedProvider = {
      ...provider,
      createdAt: toISOString(provider.createdAt) ?? "",
      updatedAt: toISOString(provider.updatedAt) ?? "",
    };

    return NextResponse.json(serializedProvider);
  } catch (error) {
    console.error("Error fetching provider:", error);
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
    const providerAccountId = Number.parseInt(id, 10);

    if (isNaN(providerAccountId)) {
      return NextResponse.json({ error: "Invalid provider account ID" }, { status: 400 });
    }

    const providersService = new ProvidersService(undefined, dataSource);
    await providersService.delete(userId, providerAccountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting provider:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}