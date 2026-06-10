import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTableConfig, isAllowedTable } from "@/lib/config/tables";

interface RouteContext {
  params: Promise<{ table: string; id: string }>;
}

/**
 * GET /api/config/[table]/[id]
 * Get a single row by primary key.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table: tableName, id: rowId } = await context.params;

  if (!isAllowedTable(tableName)) {
    return NextResponse.json(
      { error: "Invalid Table", message: `Table '${tableName}' is not a valid config table` },
      { status: 400 }
    );
  }

  const tableConfig = getTableConfig(tableName)!;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq(tableConfig.primaryKey, decodeURIComponent(rowId))
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Not Found", message: `Row with ${tableConfig.primaryKey}='${rowId}' not found` },
          { status: 404 }
        );
      }
      console.error(`[Config] Error fetching ${tableName}/${rowId}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ data });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error(`[Config] Error fetching ${tableName}/${rowId}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch row" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config/[table]/[id]
 * Update a row by primary key.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table: tableName, id: rowId } = await context.params;

  if (!isAllowedTable(tableName)) {
    return NextResponse.json(
      { error: "Invalid Table", message: `Table '${tableName}' is not a valid config table` },
      { status: 400 }
    );
  }

  const tableConfig = getTableConfig(tableName)!;

  try {
    const body = await request.json();

    // Only include editable columns
    const editableKeys = tableConfig.columns
      .filter((c) => c.editable)
      .map((c) => c.key);

    const updateData: Record<string, unknown> = {};
    for (const key of editableKeys) {
      if (body[key] !== undefined) {
        const colConfig = tableConfig.columns.find((c) => c.key === key);
        if (colConfig?.type === "json" && typeof body[key] === "string") {
          try {
            updateData[key] = JSON.parse(body[key]);
          } catch {
            updateData[key] = body[key];
          }
        } else if (colConfig?.type === "integer") {
          updateData[key] = typeof body[key] === "number" ? body[key] : parseInt(body[key], 10);
        } else if (colConfig?.type === "number") {
          updateData[key] = typeof body[key] === "number" ? body[key] : parseFloat(body[key]);
        } else if (colConfig?.type === "boolean") {
          updateData[key] = typeof body[key] === "boolean" ? body[key] : body[key] === "true";
        } else {
          updateData[key] = body[key];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Validation Error", message: "No valid fields to update" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }
    const { data, error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq(tableConfig.primaryKey, decodeURIComponent(rowId))
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Not Found", message: `Row with ${tableConfig.primaryKey}='${rowId}' not found` },
          { status: 404 }
        );
      }
      console.error(`[Config] Error updating ${tableName}/${rowId}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ data });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error(`[Config] Error updating ${tableName}/${rowId}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update row" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/config/[table]/[id]
 * Delete a row by primary key.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table: tableName, id: rowId } = await context.params;

  if (!isAllowedTable(tableName)) {
    return NextResponse.json(
      { error: "Invalid Table", message: `Table '${tableName}' is not a valid config table` },
      { status: 400 }
    );
  }

  const tableConfig = getTableConfig(tableName)!;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(tableConfig.primaryKey, decodeURIComponent(rowId));

    if (error) {
      console.error(`[Config] Error deleting ${tableName}/${rowId}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: `Row with ${tableConfig.primaryKey}='${rowId}' deleted`,
    });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error(`[Config] Error deleting ${tableName}/${rowId}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to delete row" },
      { status: 500 }
    );
  }
}
