import { NextResponse } from "next/server";
import type { AdminUser } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import {
  getTableConfig,
  isAllowedTable,
  type TableConfig,
} from "@/lib/config/tables";
import { createServiceRoleClient } from "@/lib/supabase/server";

type RowBody = Record<string, unknown>;

interface ColumnFilterQuery<TSelf> {
  eq(column: string, value: unknown): TSelf;
}

export function validateConfigTable(tableName: string):
  | { ok: true; tableConfig: TableConfig }
  | { ok: false; response: NextResponse } {
  if (!isAllowedTable(tableName)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid Table",
          message: `Table '${tableName}' is not a valid config table`,
        },
        { status: 400 },
      ),
    };
  }

  const tableConfig = getTableConfig(tableName);
  if (!tableConfig) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid Table",
          message: `Table '${tableName}' is missing config metadata`,
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, tableConfig };
}

export async function listConfigRows(
  tableName: string,
  requestUrl: string,
): Promise<NextResponse> {
  const table = validateConfigTable(tableName);
  if (!table.ok) return table.response;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return databaseUnavailable();
    }

    const url = new URL(requestUrl);
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") || "1", 10),
    );
    const pageSize = Math.min(
      500,
      Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)),
    );
    const sortColumn =
      url.searchParams.get("sort") || table.tableConfig.primaryKey;
    const sortOrder = url.searchParams.get("sortOrder") || "asc";
    const search = url.searchParams.get("search") || "";
    const filterParam = url.searchParams.get("filter") || "";
    const sortCol = table.tableConfig.columns.find(
      (column) => column.key === sortColumn,
    );
    const effectiveSort = sortCol ? sortColumn : table.tableConfig.primaryKey;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from(tableName)
      .select("*", { count: "exact" })
      .range(from, to)
      .order(effectiveSort, { ascending: sortOrder === "asc" });

    if (search) {
      const textColumns = table.tableConfig.columns
        .filter((column) => column.type === "text" && !column.hidden)
        .map((column) => column.key);

      if (textColumns.length > 0) {
        query = query.or(
          textColumns.map((column) => `${column}.ilike.%${search}%`).join(","),
        );
      }
    }

    query = applyColumnFilters(query, table.tableConfig, filterParam);
    const { data, count, error } = await query;

    if (error) {
      console.error(`[Config] Error querying ${tableName}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 },
      );
    }

    const total = count ?? 0;
    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error(`[Config] Error listing ${tableName}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list table rows" },
      { status: 500 },
    );
  }
}

export async function createConfigRow(
  admin: AdminUser,
  tableName: string,
  body: unknown,
): Promise<NextResponse> {
  const table = validateConfigTable(tableName);
  if (!table.ok) return table.response;

  try {
    const rowBody = toRowBody(body);
    if (!rowBody) {
      return NextResponse.json(
        { error: "Validation Error", message: "Request body must be an object" },
        { status: 400 },
      );
    }

    const missingFields = findMissingRequiredFields(table.tableConfig, rowBody);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: `Missing required fields: ${missingFields.join(", ")}`,
          missingFields,
        },
        { status: 400 },
      );
    }

    const insertData = pickWritableColumns(table.tableConfig, rowBody, {
      includeRequired: true,
    });
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return databaseUnavailable();
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`[Config] Error inserting into ${tableName}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType: "create_config_row",
      details: { table: tableName, row: insertData },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error(`[Config] Error creating row in ${tableName}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to create row" },
      { status: 500 },
    );
  }
}

export async function getConfigRow(
  tableName: string,
  rowId: string,
): Promise<NextResponse> {
  const table = validateConfigTable(tableName);
  if (!table.ok) return table.response;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return databaseUnavailable();
    }

    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq(table.tableConfig.primaryKey, decodeURIComponent(rowId))
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return rowNotFound(table.tableConfig, rowId);
      }
      console.error(`[Config] Error fetching ${tableName}/${rowId}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error(`[Config] Error fetching ${tableName}/${rowId}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch row" },
      { status: 500 },
    );
  }
}

export async function updateConfigRow(
  admin: AdminUser,
  tableName: string,
  rowId: string,
  body: unknown,
): Promise<NextResponse> {
  const table = validateConfigTable(tableName);
  if (!table.ok) return table.response;

  try {
    const rowBody = toRowBody(body);
    if (!rowBody) {
      return NextResponse.json(
        { error: "Validation Error", message: "Request body must be an object" },
        { status: 400 },
      );
    }

    const updateData = pickWritableColumns(table.tableConfig, rowBody, {
      includeRequired: false,
    });
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Validation Error", message: "No valid fields to update" },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return databaseUnavailable();
    }

    const { data, error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq(table.tableConfig.primaryKey, decodeURIComponent(rowId))
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return rowNotFound(table.tableConfig, rowId);
      }
      console.error(`[Config] Error updating ${tableName}/${rowId}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType: "update_config_row",
      details: { table: tableName, rowId, changes: updateData },
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error(`[Config] Error updating ${tableName}/${rowId}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update row" },
      { status: 500 },
    );
  }
}

export async function deleteConfigRow(
  admin: AdminUser,
  tableName: string,
  rowId: string,
): Promise<NextResponse> {
  const table = validateConfigTable(tableName);
  if (!table.ok) return table.response;

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return databaseUnavailable();
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(table.tableConfig.primaryKey, decodeURIComponent(rowId));

    if (error) {
      console.error(`[Config] Error deleting ${tableName}/${rowId}:`, error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 },
      );
    }

    await logAdminAction({
      adminId: admin.id,
      actionType: "delete_config_row",
      details: { table: tableName, rowId },
    });

    return NextResponse.json({
      success: true,
      message: `Row with ${table.tableConfig.primaryKey}='${rowId}' deleted`,
    });
  } catch (err) {
    console.error(`[Config] Error deleting ${tableName}/${rowId}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to delete row" },
      { status: 500 },
    );
  }
}

function applyColumnFilters<TQuery extends ColumnFilterQuery<TQuery>>(
  query: TQuery,
  tableConfig: TableConfig,
  filterParam: string,
): TQuery {
  if (!filterParam) return query;

  const filters = filterParam.split(",").filter(Boolean);
  let filteredQuery = query;
  for (const filter of filters) {
    const [colName, ...valParts] = filter.split(":");
    const value = valParts.join(":");
    if (!value) continue;

    const colConfig = tableConfig.columns.find((column) => column.key === colName);
    if (!colConfig) continue;

    if (colConfig.type === "boolean") {
      filteredQuery = filteredQuery.eq(colName, value === "true");
    } else if (colConfig.type === "integer" || colConfig.type === "number") {
      const numVal = Number(value);
      if (!Number.isNaN(numVal)) {
        filteredQuery = filteredQuery.eq(colName, numVal);
      }
    } else {
      filteredQuery = filteredQuery.eq(colName, value);
    }
  }

  return filteredQuery;
}

function findMissingRequiredFields(
  tableConfig: TableConfig,
  body: RowBody,
): string[] {
  return tableConfig.columns
    .filter((column) => column.required && !column.hidden)
    .filter((column) => {
      const value = body[column.key];
      return value === undefined || value === null || value === "";
    })
    .map((column) => column.key);
}

function pickWritableColumns(
  tableConfig: TableConfig,
  body: RowBody,
  options: { includeRequired: boolean },
): Record<string, unknown> {
  const writableColumns = tableConfig.columns.filter((column) =>
    options.includeRequired ? column.editable || column.required : column.editable,
  );
  const row: Record<string, unknown> = {};

  for (const column of writableColumns) {
    if (body[column.key] !== undefined) {
      row[column.key] = coerceColumnValue(column.type, body[column.key]);
    }
  }

  return row;
}

function coerceColumnValue(
  type: TableConfig["columns"][number]["type"],
  value: unknown,
): unknown {
  if (type === "json" && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (type === "integer") {
    return typeof value === "number" ? value : parseInt(String(value), 10);
  }
  if (type === "number") {
    return typeof value === "number" ? value : parseFloat(String(value));
  }
  if (type === "boolean") {
    return typeof value === "boolean" ? value : value === "true";
  }
  return value;
}

function toRowBody(body: unknown): RowBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  return body as RowBody;
}

function databaseUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Service temporarily unavailable - database not configured" },
    { status: 503 },
  );
}

function rowNotFound(tableConfig: TableConfig, rowId: string): NextResponse {
  return NextResponse.json(
    {
      error: "Not Found",
      message: `Row with ${tableConfig.primaryKey}='${rowId}' not found`,
    },
    { status: 404 },
  );
}
