/* eslint-disable no-console */
import { spawnSync } from "node:child_process";

const token = process.argv[2];
if (!token) {
  console.error("usage: node _call_down.mjs <refsToken>");
  process.exit(2);
}

const SHARED = process.env.AUTONOMA_SHARED_SECRET;
if (!SHARED) {
  console.error("AUTONOMA_SHARED_SECRET must be set");
  process.exit(2);
}

const NODE = process.env.NODE_BIN ?? "C:/nvm4w/nodejs/node.exe";
const PLANNER =
  process.env.AUTONOMA_PLANNER_BIN ??
  "C:/Users/malco/AppData/Local/npm-cache/_npx/7a17110e47753839/node_modules/@autonoma-ai/planner/dist/index.js";
const URL =
  process.env.AUTONOMA_URL ?? "http://localhost:3000/api/autonoma";

const r = spawnSync(
  NODE,
  [PLANNER, "sdk", "down", "--url", URL, "--refs-token", token],
  { env: { ...process.env, AUTONOMA_SHARED_SECRET: SHARED }, encoding: "utf8" },
);

console.log("STATUS:", r.status);
console.log("STDOUT:", r.stdout);
console.log("STDERR:", r.stderr);
process.exit(r.status ?? 1);