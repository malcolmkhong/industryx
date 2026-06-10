import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { TABLE_CONFIGS, getTablesByCategory } from "@/lib/config/tables";

export async function GET() {
  // Verify admin auth
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    // Fetch row counts for all tables in parallel
    const countPromises = TABLE_CONFIGS.map(async (table) => {
      const { count, error } = await supabase
        .from(table.id)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error(`[Tables] Error counting ${table.id}:`, error.message);
        return { tableId: table.id, rowCount: -1 };
      }
      return { tableId: table.id, rowCount: count ?? 0 };
    });

    const counts = await Promise.all(countPromises);
    const countMap = new Map(counts.map((c) => [c.tableId, c.rowCount]));

    // Group by category
    const byCategory = getTablesByCategory();

    const categories = Object.entries(byCategory).map(([name, tables]) => ({
      name,
      tables: tables.map((t) => ({
        id: t.id,
        displayName: t.displayName,
        icon: t.icon,
        primaryKey: t.primaryKey,
        rowCount: countMap.get(t.id) ?? 0,
      })),
    }));

    const totalRows = counts.reduce((sum, c) => sum + (c.rowCount >= 0 ? c.rowCount : 0), 0);

    const response = NextResponse.json({
      categories,
      totalTables: TABLE_CONFIGS.length,
      totalRows,
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Tables] Error listing tables:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list tables" },
      { status: 500 }
    );
  }
}
