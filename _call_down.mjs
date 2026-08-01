import { spawnSync } from "node:child_process";
const token = process.argv[2];
const NODE = "C:/nvm4w/nodejs/node.exe";
const PLANNER = "C:/Users/malco/AppData/Local/npm-cache/_npx/7a17110e47753839/node_modules/@autonoma-ai/planner/dist/index.js";
const r = spawnSync(NODE, [
  PLANNER,
  "sdk",
  "down",
  "--url",
  "http://localhost:3000/api/autonoma",
  "--refs-token",
  token,
], {
  env: { ...process.env, AUTONOMA_SHARED_SECRET: "08090b0e376578157bc6b12048fd2399dabbea15f988a417389d620e1c05b8e6" },
  encoding: "utf8",
});
console.log("STATUS:", r.status);
console.log("STDOUT:", r.stdout);
console.log("STDERR:", r.stderr);