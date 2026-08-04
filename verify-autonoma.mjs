#!/usr/bin/env node
/* eslint-disable no-console */
/** verify-autonoma.mjs — up + down + verify DB cleanup. */
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const NODE = process.env.NODE_BIN ?? "C:/nvm4w/nodejs/node.exe";
const PLANNER =
  process.env.AUTONOMA_PLANNER_BIN ??
  "C:/Users/malco/AppData/Local/npm-cache/_npx/7a17110e47753839/node_modules/@autonoma-ai/planner/dist/index.js";
const URL = process.env.AUTONOMA_URL ?? "http://localhost:3000/api/autonoma";
const RECIPE = process.env.AUTONOMA_RECIPE ?? "C:/Users/malco/.autonoma/a-industryx-industryx/recipe.json";
const SHARED = process.env.AUTONOMA_SHARED_SECRET;
if (!SHARED) {
  console.error("AUTONOMA_SHARED_SECRET must be set");
  process.exit(2);
}

function runCli(args) {
  const r = spawnSync(NODE, [PLANNER, ...args], {
    env: { ...process.env, AUTONOMA_SHARED_SECRET: SHARED },
    encoding: "utf8",
  });
  return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

function extract(jsonText, key) {
  const re = new RegExp(`"${key}":\\s*"([^"]+)"`);
  const m = jsonText.match(re);
  return m ? m[1] : null;
}

function extractOk(jsonText) {
  return /\\"ok\\":\s*true/.test(jsonText);
}

async function main() {
  console.log("=== up ===");
  const upRes = runCli([
    "sdk",
    "up",
    "--url",
    URL,
    "--recipe",
    RECIPE,
    "--timeout",
    "240",
  ]);
  if (!extractOk(upRes.out)) {
    console.error("up failed:", upRes.out.slice(0, 2000));
    process.exit(1);
  }
  const token = extract(upRes.out, "refsToken");
  if (!token) {
    console.error("no refsToken");
    process.exit(1);
  }
  await writeFile(".autonoma-token.txt", token, "utf8");
  console.log(`saved refsToken (${token.length} chars)`);

  console.log("\n=== down ===");
  const downRes = runCli(["sdk", "down", "--url", URL, "--refs-token", token]);
  console.log("down response:", downRes.out.slice(0, 500));
  if (!extractOk(downRes.out)) {
    console.error("down failed:", downRes.out.slice(0, 2000));
    process.exit(1);
  }
  console.log("\nDONE");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
