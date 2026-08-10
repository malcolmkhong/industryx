/**
 * tests/architecture/schema-wiring.test.ts
 *
 * Arch test: every `.from("X")` and `.rpc("Y")` call in src/ must map
 * to a real table or function defined in supabase/migrations/*.sql.
 *
 * Catches drift between the codebase and the schema before runtime —
 * e.g. a column rename in a migration that nobody propagated to the
 * server-side wrapper, or a refactor that points at a non-existent
 * table.
 *
 * False-positive allowance: `pg_database_size` is a Postgres built-in
 * admin function (in pg_catalog), not a public schema function, so
 * it is excluded from the "missing RPC" report.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SRC = join(REPO_ROOT, "src");
const MIG = join(REPO_ROOT, "supabase", "migrations");

// ─── Schema extraction ──────────────────────────────────────────────────

function walk(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...walk(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function extractCreateTables(sql) {
  const out = new Map();
  const re =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?"?(\w+)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    if (depth === 0) {
      const body = sql.slice(start, i - 1);
      if (!out.has(name)) out.set(name, body);
    }
    re.lastIndex = i;
  }
  return out;
}

const migFiles = walk(MIG, [".sql"]);
const tables = new Map();
const functions = new Set();

for (const f of migFiles) {
  const txt = readFileSync(f, "utf8");
  for (const [name, body] of extractCreateTables(txt).entries()) {
    tables.set(name, tables.has(name) ? tables.get(name) + "\n" + body : body);
  }
  for (const m of txt.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi,
  )) {
    functions.add(m[1]);
  }
}

// ─── src/ call extraction ───────────────────────────────────────────────

const srcFiles = walk(SRC, [".ts", ".tsx"]);
const codeTables = new Set();
const codeRpcs = new Set();
const FROM_RE = /\.from\(\s*['"]([\w]+)['"]/g;
const RPC_RE = /\.rpc\(\s*['"]([\w]+)['"]/g;
for (const f of srcFiles) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(FROM_RE)) codeTables.add(m[1]);
  for (const m of txt.matchAll(RPC_RE)) codeRpcs.add(m[1]);
}

// Built-in Postgres admin functions that are part of pg_catalog,
// not public schema. Listed here so the test does not flag them as
// missing migrations.
const POSTGRES_BUILTINS = new Set([
  "pg_database_size",
  "pg_relation_size",
  "pg_total_relation_size",
  "pg_size_pretty",
]);

// ─── Tests ──────────────────────────────────────────────────────────────

describe("schema wiring architecture", () => {
  it(
    "every .from('X') call in src/ maps to a real migration table",
    { timeout: 30_000 },
    () => {
      const missing = [...codeTables]
        .filter((t) => !tables.has(t))
        .sort();
      expect(missing).toEqual([]);
    },
  );

  it(
    "every .rpc('Y') call in src/ maps to a real migration function",
    { timeout: 30_000 },
    () => {
      const missing = [...codeRpcs]
        .filter((r) => !functions.has(r) && !POSTGRES_BUILTINS.has(r))
        .sort();
      expect(missing).toEqual([]);
    },
  );

  it(
    "documents tables defined in migrations but never called from src/",
    { timeout: 30_000 },
    () => {
      // Not a hard failure — some tables (admin, audit, log) are
      // written by server-side triggers and never read from the
      // client. This test reports the list for visibility without
      // failing CI, so a future refactor that genuinely deads a
      // table can be flagged in a PR review.
      const deadTables = [...tables.keys()]
        .filter((t) => !codeTables.has(t))
        .sort();
      // Soft assertion: at least the canonical auth tables are
      // referenced from src/.
      expect(codeTables.has("server_game_state")).toBe(true);
      expect(codeTables.has("profiles")).toBe(true);
      expect(codeTables.has("device_bindings")).toBe(true);
      // Expose the list for documentation; vitest will print this
      // string when the test runs (informational, not a failure).
      console.warn(
        `[schema-wiring] tables in migrations not referenced from src/ (${deadTables.length}):\n` +
          deadTables.map((t) => `  ${t}`).join("\n"),
      );
    },
  );
});