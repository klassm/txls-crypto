import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/database";
import { ProvidersService } from "@/server/modules/providers/providers.service";
import { toISOString } from "@/lib/utils/date";
import { getUserIdFromRequest } from "@/lib/utils/session";
import { providerSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataSource = await getDataSource();
  const providersService = new ProvidersService(undefined, dataSource);

  try {
    const providers = await providersService.findAll(userId);
    const serializedProviders = providers.map((p) => ({
      ...p,
      createdAt: toISOString(p.createdAt) ?? "",
      updatedAt: toISOString(p.updatedAt) ?? "",
    }));
    return NextResponse.json(serializedProviders);
  } catch (error) {
    console.error("Error fetching providers:", error);
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
  const providersService = new ProvidersService(undefined, dataSource);

  try {
    const body = await request.json();

    const validationResult = providerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 },
      );
    }

    const provider = await providersService.create(userId, body);
    const serializedProvider = provider ? {
      ...provider,
      createdAt: toISOString(provider.createdAt) ?? "",
      updatedAt: toISOString(provider.updatedAt) ?? "",
    } : null;
    return NextResponse.json(serializedProvider, { status: 201 });
  } catch (error) {
    console.error("Error creating provider:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}