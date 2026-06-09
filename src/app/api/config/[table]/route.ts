import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTableConfig, isAllowedTable } from "@/lib/config/tables";

interface RouteContext {
  params: Promise<{ table: string }>;
}

/**
 * GET /api/config/[table]?page=1&pageSize=50&sort=id&sortOrder=asc&search=term&filter=col:val
 * List rows from a config table with pagination, sorting, and filtering.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table: tableName } = await context.params;

  // Validate table name against allowed list
  if (!isAllowedTable(tableName)) {
    return NextResponse.json(
      { error: "Invalid Table", message: `Table '${tableName}' is not a valid config table` },
      { status: 400 }
    );
  }

  const tableConfig = getTableConfig(tableName)!;

  try {
    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    // Parse query params
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const sortColumn = url.searchParams.get("sort") || tableConfig.primaryKey;
    const sortOrder = url.searchParams.get("sortOrder") || "asc";
    const search = url.searchParams.get("search") || "";
    const filterParam = url.searchParams.get("filter") || "";

    // Validate sort column exists in table config
    const sortCol = tableConfig.columns.find((c) => c.key === sortColumn);
    const effectiveSort = sortCol ? sortColumn : tableConfig.primaryKey;

    // Build query
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from(tableName)
      .select("*", { count: "exact" })
      .range(from, to)
      .order(effectiveSort, { ascending: sortOrder === "asc" });

    // Apply text search across all text columns
    if (search) {
      const textColumns = tableConfig.columns
        .filter((c) => c.type === "text" && !c.hidden)
        .map((c) => c.key);

      if (textColumns.length > 0) {
        // Use OR filter for text search across columns
        const orFilters = textColumns.map((col) => `${col}.ilike.%${search}%`).join(",");
        query = query.or(orFilters);
      }
    }

    // Apply column filters (format: "col1:val1,col2:val2")
    if (filterParam) {
      const filters = filterParam.split(",").filter(Boolean);
      for (const f of filters) {
        const [colName, ...valParts] = f.split(":");
        const value = valParts.join(":");
        if (!value) continue;

        // Validate column exists
        const colConfig = tableConfig.columns.find((c) => c.key === colName);
        if (!colConfig) continue;

        if (colConfig.type === "boolean") {
          query = query.eq(colName, value === "true");
        } else if (colConfig.type === "integer" || colConfig.type === "number") {
          const numVal = Number(value);
          if (!isNaN(numVal)) {
            query = query.eq(colName, numVal);
          }
        } else {
          query = query.eq(colName, value);
        }
      }
    }

    const { data, count, error } = await query;

    if (error) {
      console.error(`[Config] Error querying ${tableName}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    const response = NextResponse.json({
      data: data || [],
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error(`[Config] Error listing ${tableName}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list table rows" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config/[table]
 * Create a new row in a config table.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { table: tableName } = await context.params;

  if (!isAllowedTable(tableName)) {
    return NextResponse.json(
      { error: "Invalid Table", message: `Table '${tableName}' is not a valid config table` },
      { status: 400 }
    );
  }

  const tableConfig = getTableConfig(tableName)!;

  try {
    const body = await request.json();

    // Validate required fields
    const requiredColumns = tableConfig.columns.filter((c) => c.required && !c.hidden);
    const missingFields: string[] = [];

    for (const col of requiredColumns) {
      if (body[col.key] === undefined || body[col.key] === null || body[col.key] === "") {
        missingFields.push(col.key);
      }
    }

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: `Missing required fields: ${missingFields.join(", ")}`,
          missingFields,
        },
        { status: 400 }
      );
    }

    // Only include columns that are defined in the table config and are editable or required
    const allowedKeys = tableConfig.columns
      .filter((c) => c.editable || c.required)
      .map((c) => c.key);

    const insertData: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        // Parse JSON columns
        const colConfig = tableConfig.columns.find((c) => c.key === key);
        if (colConfig?.type === "json" && typeof body[key] === "string") {
          try {
            insertData[key] = JSON.parse(body[key]);
          } catch {
            insertData[key] = body[key];
          }
        } else if (colConfig?.type === "integer") {
          insertData[key] = typeof body[key] === "number" ? body[key] : parseInt(body[key], 10);
        } else if (colConfig?.type === "number") {
          insertData[key] = typeof body[key] === "number" ? body[key] : parseFloat(body[key]);
        } else if (colConfig?.type === "boolean") {
          insertData[key] = typeof body[key] === "boolean" ? body[key] : body[key] === "true";
        } else {
          insertData[key] = body[key];
        }
      }
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from(tableName)
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`[Config] Error inserting into ${tableName}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ data }, { status: 201 });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error(`[Config] Error creating row in ${tableName}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to create row" },
      { status: 500 }
    );
  }
}
