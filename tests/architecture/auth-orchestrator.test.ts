/**
 * tests/architecture/auth-orchestrator.test.ts
 *
 * Architecture test enforcing the canonical bootstrap flow per
 * AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §4 (canonical flow) and §21 PR 5
 * (cleanup gate). This is the gate that prevents new callers from
 * re-introducing the legacy split-startup pipeline.
 *
 * Scope:
 *   A1. No source file under src/ calls the deprecated routes
 *       (guest/quickstart, device/register, game/state/initial) via
 *       fetch/axios/undici. Only the route files themselves and the
 *       thin PR-4 wrappers are allowed callers.
 *   A2. No test file under tests/api/auth/ exists for the deprecated
 *       routes (guest/quickstart, device/register, identity/link,
 *       identity/confirm-link). Legacy tests must be moved to
 *       tests/api/auth/_deprecated/ or marked .skip before removal.
 *   A3. src/components/providers/AuthProvider.tsx MUST import
 *       AuthOrchestratorBootstrapDeps from @/lib/auth/orchestrator
 *       (not the legacy AuthOrchestratorDeps alias).
 *   A4. src/app/test/auth-orchestrator/page.tsx MUST also use the new
 *       shape.
 *   A5. No Math.random() for any session-id / device-id / request-id
 *       generation (SEC-008). Allowed only in src/lib/game/** config
 *       generators that produce non-security values.
 *   A6. No select('*') in src/app/api/ or src/lib/db/ (PER-003).
 *   A7. Every file in src/app/api/auth/ except _shared/ MUST import
 *       checkRateLimit from @/lib/auth/rateLimiter (API-001).
 *
 * Design notes:
 *   - Pure fs+path walk. No child processes, no network, < 5 s total.
 *   - Idempotent. Each run reads the same files in the same order.
 *   - Each violation is reported as file:line so the lead can review.
 *   - Failures are tolerated in the report (P1 bug surface); the test
 *     fails fast so CI catches future regressions.
 *
 * Verification harness:
 *   To prove the test catches a violation, drop a scratch file with a
 *   deprecated-route fetch into tmp/ and re-run; the scratch MUST show
 *   up in the A1 violations list. See README at end of file.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep, posix } from "node:path";

// ─── Repo root resolution ──────────────────────────────────────────────

const REPO_ROOT = process.cwd();

function toRepoPosix(absOrRel: string): string {
  // Normalize to a repo-relative POSIX path so error messages are
  // readable on Windows runners.
  const abs = absOrRel.startsWith(REPO_ROOT)
    ? absOrRel
    : join(REPO_ROOT, absOrRel);
  return relative(REPO_ROOT, abs).split(sep).join(posix.sep);
}

// ─── File walking helpers ──────────────────────────────────────────────

interface WalkOpts {
  /** POSIX glob prefix relative to repo root (e.g. "src"). */
  root: string;
  /** Restrict to these file extensions. Empty = all files. */
  exts?: string[];
  /** Exclude any directory whose POSIX path matches any of these. */
  excludeDirs?: string[];
  /** Exclude any file whose POSIX path matches any of these. */
  excludeFiles?: string[];
}

function walkFiles(opts: WalkOpts): string[] {
  const { root, exts = [], excludeDirs = [], excludeFiles = [] } = opts;
  const rootAbs = join(REPO_ROOT, root);
  if (!existsSync(rootAbs)) return [];
  const out: string[] = [];

  const visit = (dirAbs: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dirAbs);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(dirAbs, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      const relPosix = toRepoPosix(abs);
      if (st.isDirectory()) {
        if (excludeDirs.some((d) => relPosix === d || relPosix.startsWith(`${d}/`))) {
          continue;
        }
        visit(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (excludeFiles.some((f) => relPosix === f)) continue;
      if (exts.length > 0 && !exts.some((e) => name.endsWith(e))) continue;
      out.push(relPosix);
    }
  };

  visit(rootAbs);
  return out.sort();
}

// ─── Source scanning helpers ───────────────────────────────────────────

interface Hit {
  file: string;
  line: number;
  /** Matched substring for context. */
  match: string;
}

/**
 * Read a file and return every line that contains the regex. Lines are
 * 1-indexed to match editor / linter conventions.
 */
function scanFileForMatches(relPosix: string, regex: RegExp): Hit[] {
  const abs = join(REPO_ROOT, relPosix);
  let content: string;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const hits: Hit[] = [];
  // Match the regex against each line. Multi-line regexes are not
  // supported — keep patterns simple.
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(regex);
    if (m && m[0]) {
      hits.push({ file: relPosix, line: i + 1, match: m[0] });
    }
  }
  return hits;
}

/**
 * Read a file and return all regex matches across the entire content,
 * yielding 1-indexed line numbers based on the matched character offset.
 * Used for cross-line patterns such as `fetch(\n  "/api/..."`.
 */
function scanFileAll(relPosix: string, regex: RegExp): Hit[] {
  const abs = join(REPO_ROOT, relPosix);
  let content: string;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const hits: Hit[] = [];
  // Strip line comments so we don't flag commented-out references.
  // This is a coarse heuristic but adequate for the patterns below.
  const stripped = content
    .split(/\r?\n/)
    .map((l) => {
      // Remove `// ...` from the middle of the line (best-effort).
      const idx = l.indexOf("//");
      return idx === -1 ? l : l.slice(0, idx);
    })
    .join("\n");

  // Pre-compute line offsets on the stripped content.
  const lineOffsets: number[] = [];
  {
    let off = 0;
    for (const l of stripped.split("\n")) {
      lineOffsets.push(off);
      off += l.length + 1;
    }
  }

  const findLine = (offset: number): number => {
    // Binary search would be cleaner; linear is fine for files < 5k lines.
    let line = 1;
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] > offset) break;
      line = i + 1;
    }
    return line;
  };

  let m: RegExpExecArray | null;
  // Reset regex state.
  regex.lastIndex = 0;
  while ((m = regex.exec(stripped)) !== null) {
    hits.push({
      file: relPosix,
      line: findLine(m.index),
      match: m[0].slice(0, 120),
    });
    // Avoid infinite loop on zero-length matches.
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return hits;
}

// ─── A1: deprecated route callers ─────────────────────────────────────

/**
 * Route paths (relative to repo) that own the legacy route file. The
 * route file itself is allowed to mention its own URL (e.g. for logging
 * or as the redirect target). Everything else in src/ MUST NOT call it.
 */
const DEPRECATED_ROUTE_FILES: ReadonlySet<string> = new Set([
  "src/app/api/auth/guest/quickstart/route.ts",
  "src/app/api/auth/device/register/route.ts",
  "src/app/api/game/state/initial/route.ts",
]);

/**
 * The shared URL-log helper has these URLs as DATA, not as fetch calls.
 * It is the only place outside the route files that may mention the
 * deprecated route paths without invoking them.
 */
const URL_LIST_DATA_FILES: ReadonlySet<string> = new Set([
  "src/app/api/auth/_shared/request-ip-log-helper.ts",
  // The orchestrator comments document the deprecated routes on purpose.
  "src/lib/auth/orchestrator/AuthOrchestrator.ts",
  // API structure plan is documentation, not code.
  "src/app/api/API_STRUCTURE_PLAN.md",
]);

/**
 * Deprecated HTTP paths checked by A1. Each entry is matched as a
 * literal substring inside an HTTP call expression.
 */
const DEPRECATED_ROUTE_PATTERNS: ReadonlyArray<{
  route: string;
  label: string;
}> = [
  { route: "/api/auth/guest/quickstart", label: "guest/quickstart" },
  { route: "/api/auth/device/register", label: "device/register" },
  { route: "/api/game/state/initial", label: "game/state/initial" },
];

const ALLOWED_CALLER_EXEMPTIONS: ReadonlySet<string> = new Set([
  ...DEPRECATED_ROUTE_FILES,
  ...URL_LIST_DATA_FILES,
]);

/**
 * Pattern: any HTTP-call-shaped expression whose argument string
 * contains one of the deprecated route paths. Captures
 * `fetch`, `axios.<method>`, or a generic `request(` shape. We are
 * intentionally narrow to avoid false positives in pure string data
 * (e.g. URL lists in `request-ip-log-helper.ts`).
 */
function buildDeprecatedCallerRegex(): RegExp {
  const routes = DEPRECATED_ROUTE_PATTERNS.map((p) =>
    p.route.replace(/[/]/g, "\\/"),
  ).join("|");
  // fetch(...), axios.get/post(...), request(...) within ~200 chars
  // of the deprecated route path. Single regex, no /s flag.
  return new RegExp(
    `(?:fetch|axios\\.[a-z]+|undici\\.[a-z]+|request)\\s*\\(\\s*['"\`](?:[^'"\`]{0,200}?)(?:${routes})`,
    "g",
  );
}

function collectA1Violations(): Hit[] {
  const files = walkFiles({
    root: "src",
    exts: [".ts", ".tsx"],
    excludeDirs: [
      // Never recurse into generated / build output.
      ".next",
      "node_modules",
    ],
  });
  const regex = buildDeprecatedCallerRegex();
  const hits: Hit[] = [];
  for (const f of files) {
    if (ALLOWED_CALLER_EXEMPTIONS.has(f)) continue;
    const fileHits = scanFileAll(f, regex);
    hits.push(...fileHits);
  }
  return hits;
}

// ─── A2: deprecated test files ─────────────────────────────────────────

/**
 * Test file names that must NOT exist under tests/api/auth/ unless
 * they live in a `_deprecated/` subdir or contain a `.skip` / `.todo`
 * marker at the describe level.
 */
const DEPRECATED_TEST_PATTERNS: ReadonlyArray<{
  /** Regex applied to the file basename (e.g. "link-identity.test.ts"). */
  filename: RegExp;
  label: string;
}> = [
  { filename: /quickstart.*\.test\.ts$/, label: "guest/quickstart" },
  { filename: /register.*\.test\.ts$/, label: "device/register" },
  { filename: /link-identity.*\.test\.ts$/, label: "identity/link" },
  { filename: /confirm-link.*\.test\.ts$/, label: "identity/confirm-link" },
];

interface A2Violation {
  file: string;
  reason: string;
}

function collectA2Violations(): A2Violation[] {
  const files = walkFiles({
    root: "tests/api/auth",
    exts: [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"],
    // _deprecated/ subdir is the documented home for legacy tests.
  });
  const out: A2Violation[] = [];
  for (const f of files) {
    // _deprecated/ subtree is the legacy home (plan §18).
    if (f.includes("/_deprecated/")) continue;

    // Filename match?
    const basename = f.split("/").pop() ?? "";
    const matched = DEPRECATED_TEST_PATTERNS.find((p) =>
      p.filename.test(basename),
    );
    if (!matched) continue;

    // Must be skipped at describe-level OR marked .todo. Read content.
    const content = readFileSync(join(REPO_ROOT, f), "utf8");
    const hasSkip =
      /describe\.skip\s*\(/.test(content) ||
      /describe\.todo\s*\(/.test(content);
    if (hasSkip) continue;
    out.push({
      file: f,
      reason: `Active test for deprecated route "${matched.label}". Move to tests/api/auth/_deprecated/ or add describe.skip / describe.todo.`,
    });
  }
  return out;
}

// ─── A3: AuthProvider uses new deps ────────────────────────────────────

function collectA3Violations(): string[] {
  const file = "src/components/providers/AuthProvider.tsx";
  const abs = join(REPO_ROOT, file);
  if (!existsSync(abs)) return [`Missing file: ${file}`];
  const content = readFileSync(abs, "utf8");
  const out: string[] = [];

  // Must import AuthOrchestratorBootstrapDeps (not just the legacy alias).
  const importsBootstrapDeps =
    /from\s+["'`]@\/lib\/auth\/orchestrator["'`][\s\S]{0,400}?AuthOrchestratorBootstrapDeps/.test(
      content,
    );
  if (!importsBootstrapDeps) {
    out.push(
      `${file}: AuthProvider.tsx must import AuthOrchestratorBootstrapDeps from "@/lib/auth/orchestrator" (post-PR4-4A shape). The legacy AuthOrchestratorDeps alias must not be wired here.`,
    );
  }

  // Must NOT call the legacy fetch handlers (quickstart/registerDevice
  // wrap POST /api/auth/guest/quickstart and /api/auth/device/register).
  if (/fetch\(\s*["'`]\/api\/auth\/guest\/quickstart/.test(content)) {
    out.push(
      `${file}: AuthProvider.tsx still calls fetch("/api/auth/guest/quickstart"). Use orchestrator.callBootstrap via AuthOrchestratorBootstrapDeps.`,
    );
  }
  if (/fetch\(\s*["'`]\/api\/auth\/device\/register/.test(content)) {
    out.push(
      `${file}: AuthProvider.tsx still calls fetch("/api/auth/device/register"). Use orchestrator.callBootstrap via AuthOrchestratorBootstrapDeps.`,
    );
  }
  return out;
}

// ─── A4: test page uses new shape ──────────────────────────────────────

function collectA4Violations(): string[] {
  const file = "src/app/test/auth-orchestrator/page.tsx";
  const abs = join(REPO_ROOT, file);
  if (!existsSync(abs)) return [`Missing file: ${file}`];
  const content = readFileSync(abs, "utf8");
  const out: string[] = [];

  // Legacy alias AuthOrchestratorDeps MUST NOT be used here.
  // We accept either the canonical AuthOrchestratorBootstrapDeps or
  // a fully removed legacy import (test page should call the new
  // orchestrator with the new shape).
  const usesLegacy =
    /import\s+type\s*\{[^}]*\bAuthOrchestratorDeps\b[^}]*\}\s*from/.test(
      content,
    ) ||
    /\bAuthOrchestratorDeps\b(?!\s*=\s*AuthOrchestratorBootstrapDeps)/.test(
      content,
    );
  if (usesLegacy) {
    out.push(
      `${file}: page.tsx still references the legacy AuthOrchestratorDeps alias. Migrate to AuthOrchestratorBootstrapDeps (post-PR4-4A shape).`,
    );
  }

  // Must reference the new orchestrator call path (callBootstrap).
  if (!/callBootstrap/.test(content)) {
    out.push(
      `${file}: page.tsx does not wire orchestrator.callBootstrap. The harness must exercise the canonical bootstrap dep, not the legacy quickstart/registerDevice callbacks.`,
    );
  }
  return out;
}

// ─── A5: Math.random for security IDs ──────────────────────────────────

/**
 * Patterns that strongly suggest Math.random is being used for an
 * ID-shaped string. We look for the literal "Math.random" call inside
 * a template string or concat that targets an id / key / token / uuid
 * / session / device / request / correlation / fingerprint / visitor /
 * admin- context.
 *
 * Files under src/lib/game/** are exempt per plan §18 ("config
 * generators that produce non-security values").
 */
const ID_LIKE_NEARBY_TOKENS = [
  "id",
  "key",
  "token",
  "uuid",
  "session",
  "device",
  "request",
  "correlation",
  "fingerprint",
  "visitor",
  "admin",
];

function buildMathRandomIdRegex(): RegExp {
  // Match `Math.random()` (with optional `.toString(...)`) inside any
  // expression. The surrounding 200 chars of context are then checked
  // manually for ID-like tokens.
  return /Math\.random\s*\(/g;
}

interface A5Violation extends Hit {
  context: string;
}

function isAllowedGameConfig(relPosix: string): boolean {
  return relPosix.startsWith("src/lib/game/");
}

function collectA5Violations(): A5Violation[] {
  const files = [
    ...walkFiles({ root: "src", exts: [".ts", ".tsx"] }),
    ...walkFiles({ root: "tests", exts: [".ts", ".tsx"] }),
  ];
  const regex = buildMathRandomIdRegex();
  const out: A5Violation[] = [];

  for (const f of files) {
    if (isAllowedGameConfig(f)) continue;
    const abs = join(REPO_ROOT, f);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    // Strip line comments so commented-out references are not flagged.
    const stripped = content
      .split(/\r?\n/)
      .map((l) => {
        const idx = l.indexOf("//");
        return idx === -1 ? l : l.slice(0, idx);
      })
      .join("\n");

    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(stripped)) !== null) {
      const start = Math.max(0, m.index - 200);
      const end = Math.min(stripped.length, m.index + m[0].length + 200);
      const window = stripped.slice(start, end).toLowerCase();
      const isIdContext = ID_LIKE_NEARBY_TOKENS.some((tok) =>
        window.includes(tok),
      );
      if (!isIdContext) continue;
      // Compute line number.
      const before = stripped.slice(0, m.index);
      const line = before.split("\n").length;
      out.push({
        file: f,
        line,
        match: m[0],
        context: window.replace(/\s+/g, " ").slice(0, 160),
      });
    }
  }
  return out;
}

// ─── A6: select('*') forbidden ─────────────────────────────────────────

function collectA6Violations(): Hit[] {
  const files = [
    ...walkFiles({ root: "src/app/api", exts: [".ts", ".tsx"] }),
    ...walkFiles({ root: "src/lib/db", exts: [".ts", ".tsx"] }),
  ];
  const out: Hit[] = [];
  // Match `select('*')` or `select("*")` (case-insensitive). We avoid
  // matching `select('id, name')` style lists which are legitimate.
  const regex = /\.select\(\s*['"`]\*['"`]\s*\)/gi;
  for (const f of files) {
    out.push(...scanFileForMatches(f, regex));
  }
  return out;
}

// ─── A7: rate limit on every auth route ────────────────────────────────

interface A7Violation {
  file: string;
  reason: string;
}

function collectA7Violations(): A7Violation[] {
  const authFiles = walkFiles({
    root: "src/app/api/auth",
    exts: [".ts", ".tsx"],
  });
  const out: A7Violation[] = [];
  for (const f of authFiles) {
    // _shared/ is exempt: helpers used by route handlers that already
    // enforce rate limits at the call site.
    if (f.includes("/_shared/")) continue;

    // Skip non-handler files (e.g. README.md is filtered by ext anyway,
    // but defensive).
    if (!f.endsWith("route.ts")) continue;

    const content = readFileSync(join(REPO_ROOT, f), "utf8");
    const importsRateLimiter =
      /from\s+["'`]@\/lib\/auth\/rateLimiter["'`]/.test(content) &&
      /\bcheckRateLimit\b/.test(content);
    if (!importsRateLimiter) {
      out.push({
        file: f,
        reason: `${f}: route handler does not import checkRateLimit from "@/lib/auth/rateLimiter". API-001 requires rate limiting on every useful route.`,
      });
    }
  }
  return out;
}

// ─── Suite ─────────────────────────────────────────────────────────────

function formatHits(hits: Hit[]): string {
  return hits
    .map((h) => `  - ${h.file}:${h.line}  ${h.match}`)
    .join("\n");
}

describe("auth orchestrator architecture", () => {
  // ─── A1 ────────────────────────────────────────────────────────────
  it("A1: no src/ caller uses the deprecated bootstrap routes via fetch/axios/undici", () => {
    const hits = collectA1Violations();
    if (hits.length > 0) {
      throw new Error(
        `Found ${hits.length} deprecated-route caller(s) in src/. ` +
          `Only the route files themselves and tests/api/auth/_shared/request-ip-log-helper.ts are allowed to reference these URLs.\n` +
          formatHits(hits),
      );
    }
    expect(hits).toEqual([]);
  });

  // ─── A2 ────────────────────────────────────────────────────────────
  it("A2: no active test file under tests/api/auth/ covers a deprecated route", () => {
    const violations = collectA2Violations();
    if (violations.length > 0) {
      const list = violations
        .map((v) => `  - ${v.file}\n      ${v.reason}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} active test file(s) for deprecated routes. ` +
          `Move them to tests/api/auth/_deprecated/ or add describe.skip / describe.todo until telemetry confirms zero callers.\n` +
          list,
      );
    }
    expect(violations).toEqual([]);
  });

  // ─── A3 ────────────────────────────────────────────────────────────
  it("A3: AuthProvider.tsx wires the post-PR4-4A orchestrator deps shape", () => {
    const msgs = collectA3Violations();
    if (msgs.length > 0) {
      throw new Error(
        `AuthProvider.tsx has not migrated to the canonical bootstrap flow:\n` +
          msgs.map((m) => `  - ${m}`).join("\n"),
      );
    }
    expect(msgs).toEqual([]);
  });

  // ─── A4 ────────────────────────────────────────────────────────────
  it("A4: src/app/test/auth-orchestrator/page.tsx uses the post-PR4-4A orchestrator shape", () => {
    const msgs = collectA4Violations();
    if (msgs.length > 0) {
      throw new Error(
        `Auth-harness test page has not migrated:\n` +
          msgs.map((m) => `  - ${m}`).join("\n"),
      );
    }
    expect(msgs).toEqual([]);
  });

  // ─── A5 ────────────────────────────────────────────────────────────
  it("A5: Math.random is not used to generate security IDs (SEC-008)", () => {
    const hits = collectA5Violations();
    if (hits.length > 0) {
      const list = hits
        .map(
          (h) =>
            `  - ${h.file}:${h.line}  ${h.match}\n      ctx: ${h.context}`,
        )
        .join("\n");
      throw new Error(
        `Found ${hits.length} Math.random() call(s) inside an ID-shaped context outside src/lib/game/**. ` +
          `Replace with crypto.randomUUID() per SEC-008.\n` +
          list,
      );
    }
    expect(hits).toEqual([]);
  });

  // ─── A6 ────────────────────────────────────────────────────────────
  it("A6: no select('*') in src/app/api/ or src/lib/db/ (PER-003)", () => {
    const hits = collectA6Violations();
    if (hits.length > 0) {
      throw new Error(
        `Found ${hits.length} select('*') call(s). ` +
          `PER-003 requires explicit column lists. Replace with .select('col_a,col_b,...') or RPC.\n` +
          formatHits(hits),
      );
    }
    expect(hits).toEqual([]);
  });

  // ─── A7 ────────────────────────────────────────────────────────────
  it("A7: every src/app/api/auth/ route handler imports checkRateLimit (API-001)", () => {
    const violations = collectA7Violations();
    if (violations.length > 0) {
      const list = violations
        .map((v) => `  - ${v.file}\n      ${v.reason}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} auth route handler(s) without rate limiting:\n` +
          list,
      );
    }
    expect(violations).toEqual([]);
  });
});

/**
 * ─── Verification harness ─────────────────────────────────────────────
 *
 * To prove the test catches a violation:
 *
 *   1. Drop a scratch file:
 *
 *        mkdir -p tmp
 *        cat > tmp/violation-scratch.ts <<'EOF'
 *        export async function badCaller() {
 *          const res = await fetch("/api/auth/guest/quickstart", {
 *            method: "POST",
 *            body: JSON.stringify({ deviceId: "x" }),
 *          });
 *          return res;
 *        }
 *        EOF
 *
 *   2. Add `tmp` to the A1 walker in this file (just for the duration
 *      of the smoke test) OR move the scratch under `src/` so it falls
 *      under the normal walker scope:
 *
 *        mkdir -p src/__scratch__
 *        cp tmp/violation-scratch.ts src/__scratch__/violation-scratch.ts
 *
 *   3. Re-run:
 *
 *        bun run test:vitest tests/architecture/auth-orchestrator.test.ts
 *
 *      A1 must FAIL with the scratch file:line in the error.
 *
 *   4. Delete the scratch file:
 *
 *        rm -rf src/__scratch__ tmp
 *
 * The smoke is documented in PR 5D's verification log; it is NOT
 * automated in this file because the test must remain deterministic.
 */