#!/usr/bin/env node
// _upload-qa-tests.mjs — manually POST qa-tests/ + artifacts to the Autonoma dashboard.
//
// Replicates what `npx @autonoma-ai/planner@latest upload` does, based on the
// planner source we reverse-engineered from the npm bundle. The planner's `upload`
// subcommand reports "0 test cases" even when qa-tests/ has 89 files — likely
// a glob/encoding bug in the planner v0.1.24. This script reads qa-tests/
// directly and ships them.
//
// Required env vars:
//   AUTONOMA_API_TOKEN        — the `ask_...` token from autonoma.app/settings/api-keys
//   AUTONOMA_GENERATION_ID    — the `cms...` setup id
//
// Usage:
//   $env:AUTONOMA_API_TOKEN = "ask_..."
//   $env:AUTONOMA_GENERATION_ID = "cms..."
//   node _upload-qa-tests.mjs

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const API_TOKEN = process.env.AUTONOMA_API_TOKEN;
const GENERATION_ID = process.env.AUTONOMA_GENERATION_ID;
const API_URL = process.env.AUTONOMA_API_URL ?? "https://autonoma.app";
const OUTPUT_DIR = process.env.AUTONOMA_OUTPUT_DIR ??
  `C:/Users/malco/.autonoma/a-industryx-industryx`;

if (!API_TOKEN || !GENERATION_ID) {
  console.error("AUTONOMA_API_TOKEN and AUTONOMA_GENERATION_ID must be set");
  process.exit(2);
}

/** Walk qa-tests/ and return { name, content, folder } for every non-INDEX .md. */
async function readTestCases(rootDir) {
  const testsDir = join(rootDir, "qa-tests");
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_invalid") continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const rel = relative(testsDir, fullPath).split(sep);
        const name = rel[rel.length - 1];
        const folder = rel.slice(0, -1).join("/");
        const content = await readFile(fullPath, "utf-8");
        out.push({ name, content, folder: folder.length > 0 ? folder : undefined });
      }
    }
  }
  await walk(testsDir);
  return out.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
}

/** Read the 3 root artifacts the planner also ships. */
async function readArtifacts(rootDir) {
  const names = ["AUTONOMA.md", "scenarios.md", "entity-audit.md"];
  const out = [];
  for (const name of names) {
    try {
      const content = await readFile(join(rootDir, name), "utf-8");
      out.push({ name, content });
    } catch {
      // skip missing
    }
  }
  return out;
}

/** Best-effort git sha from the planner's .git-info.json sidecar. */
async function readGitSha(rootDir) {
  try {
    const raw = JSON.parse(await readFile(join(rootDir, ".git-info.json"), "utf-8"));
    return raw?.sha ?? null;
  } catch {
    return null;
  }
}

/** POST JSON with bearer auth. */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text };
}

/** PATCH JSON with bearer auth. */
async function patchJson(url, body) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text };
}

async function main() {
  const setupUrl = `${API_URL}/v1/setup/setups/${GENERATION_ID}`;

  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log(`Generation: ${GENERATION_ID}`);

  const testCases = await readTestCases(OUTPUT_DIR);
  const artifacts = await readArtifacts(OUTPUT_DIR);
  const commitSha = await readGitSha(OUTPUT_DIR);

  console.log(`Found ${testCases.length} test cases, ${artifacts.length} artifacts.`);
  if (testCases.length === 0) {
    console.error("No test cases found on disk — check qa-tests/ directory.");
    process.exit(1);
  }

  console.log(`\nPOST ${setupUrl}/artifacts`);
  const upRes = await postJson(`${setupUrl}/artifacts`, {
    testCases,
    artifacts,
    commitSha,
  });
  console.log(`status: ${upRes.status}`);
  if (!upRes.ok) {
    console.error(`Body: ${upRes.body.slice(0, 500)}`);
    process.exit(1);
  }

  console.log(`\nPATCH ${setupUrl}`);
  const patchRes = await patchJson(setupUrl, { status: "completed" });
  console.log(`status: ${patchRes.status}`);
  if (!patchRes.ok) {
    console.error(`Body: ${patchRes.body.slice(0, 500)}`);
  }

  console.log(`\nDone. Refresh https://autonoma.app to see qa-tests/ uploaded.`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
