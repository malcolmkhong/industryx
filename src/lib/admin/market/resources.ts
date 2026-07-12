import { NextResponse } from "next/server";
import type { AdminUser } from "@/lib/auth/admin";
import { logAdminActionResource } from "@/lib/db/adminActions";
import {
  createMarketConfigWithError,
  getMarketConfigById,
  updateMarketConfigWithError,
  type ValidSector,
} from "@/lib/db/configMarket";
import { createServiceRoleClient } from "@/lib/supabase/server";

const VALID_SECTORS = [
  "raw_minerals",
  "raw_organic",
  "basic_materials",
  "components",
  "advanced",
  "high_tech",
  "endgame",
  "agriculture",
] as const;

const RESOURCE_ID_RE = /^[a-z][a-z0-9-]{0,49}$/;

interface ResourceBody {
  resource_id?: unknown;
  base_price?: unknown;
  sector?: unknown;
  elasticity?: unknown;
  is_tradable?: unknown;
}

interface ValidResourceBody {
  resource_id: string;
  base_price: number;
  sector: ValidSector;
  elasticity: number;
  is_tradable: boolean;
}

export function isValidMarketResourceId(resourceId: string): boolean {
  return RESOURCE_ID_RE.test(resourceId);
}

export async function handleCreateMarketResource(
  admin: AdminUser,
  body: unknown,
  ipAddress: string | null,
): Promise<NextResponse> {
  const validation = validateBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const data = validation.data;
  const existing = await getMarketConfigById(data.resource_id);
  if (existing) {
    return NextResponse.json(
      { error: `Resource "${data.resource_id}" already exists` },
      { status: 409 },
    );
  }

  const { data: inserted, errorCode, errorMessage } =
    await createMarketConfigWithError(data);
  if (!inserted) {
    const isDuplicate = errorCode === "23505";
    return NextResponse.json(
      {
        error: isDuplicate
          ? `Resource "${data.resource_id}" already exists`
          : errorMessage ?? "Insert failed",
        code: errorCode ?? "UNKNOWN",
      },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  await logAdminActionResource({
    adminId: admin.id,
    actionType: "market.create_resource",
    targetId: data.resource_id,
    payload: { ...data },
    ipAddress,
  });

  return NextResponse.json({ success: true, resource: inserted }, { status: 201 });
}

export async function handleUpdateMarketResource(
  admin: AdminUser,
  body: unknown,
  ipAddress: string | null,
): Promise<NextResponse> {
  const validation = validateBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const data = validation.data;
  const { data: updated, errorCode, errorMessage } =
    await updateMarketConfigWithError(data.resource_id, data);
  if (!updated) {
    return NextResponse.json(
      { error: errorMessage ?? "Update failed", code: errorCode ?? "UNKNOWN" },
      { status: errorCode === "PGRST116" ? 404 : 500 },
    );
  }

  await logAdminActionResource({
    adminId: admin.id,
    actionType: "market.update_resource",
    targetId: data.resource_id,
    payload: { ...data },
    ipAddress,
  });

  return NextResponse.json({ success: true, resource: updated });
}

export async function handleDeleteMarketResource(
  admin: AdminUser,
  resourceId: string,
  ipAddress: string | null,
): Promise<NextResponse> {
  if (!isValidMarketResourceId(resourceId)) {
    return NextResponse.json(
      { error: "resource_id must be kebab-case" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  const existing = await getMarketConfigById(resourceId);
  if (!existing) {
    return NextResponse.json(
      { error: "Delete failed (resource not found)" },
      { status: 404 },
    );
  }

  const { count: historyCount } = await supabase
    .from("trade_history")
    .select("id", { count: "exact", head: true })
    .or(`give_resource.eq.${resourceId},receive_resource.eq.${resourceId}`);

  if (historyCount && historyCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${resourceId}" - referenced in ${historyCount} trade history record(s). Set is_tradable=false instead to retire it.`,
        code: "RESOURCE_HAS_HISTORY",
      },
      { status: 409 },
    );
  }

  const { error: deleteError } = await supabase
    .from("game_config_market")
    .delete()
    .eq("resource_id", resourceId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await logAdminActionResource({
    adminId: admin.id,
    actionType: "market.delete_resource",
    targetId: resourceId,
    payload: { resource_id: resourceId },
    ipAddress,
  });

  return NextResponse.json({ success: true, resource_id: resourceId });
}

function validateBody(
  body: unknown,
): { ok: true; data: ValidResourceBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }

  const { resource_id, base_price, sector, elasticity, is_tradable } =
    body as ResourceBody;

  if (typeof resource_id !== "string" || !RESOURCE_ID_RE.test(resource_id)) {
    return {
      ok: false,
      error: "resource_id must be kebab-case (a-z, 0-9, hyphen), 1-50 chars",
    };
  }
  if (
    typeof base_price !== "number" ||
    !Number.isFinite(base_price) ||
    base_price <= 0 ||
    base_price > 1e9
  ) {
    return {
      ok: false,
      error: "base_price must be a positive finite number <= 1e9",
    };
  }
  if (
    typeof sector !== "string" ||
    !VALID_SECTORS.includes(sector as ValidSector)
  ) {
    return {
      ok: false,
      error: `sector must be one of: ${VALID_SECTORS.join(", ")}`,
    };
  }
  if (
    typeof elasticity !== "number" ||
    !Number.isFinite(elasticity) ||
    elasticity < 0 ||
    elasticity > 1.5
  ) {
    return { ok: false, error: "elasticity must be in [0, 1.5]" };
  }
  if (typeof is_tradable !== "boolean") {
    return { ok: false, error: "is_tradable must be a boolean" };
  }

  return {
    ok: true,
    data: {
      resource_id,
      base_price,
      sector: sector as ValidSector,
      elasticity,
      is_tradable,
    },
  };
}
