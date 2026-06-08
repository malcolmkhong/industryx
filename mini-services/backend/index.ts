// IndustriaX Backend Service - Entry Point
// Uses bun --hot for auto-restart when files change
import { spawn } from "child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

const port = 3001;
const pidFile = join(import.meta.dir, ".next-dev.pid");

// Kill any existing next dev process
function killExistingProcess() {
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, "SIGTERM");
          console.log(`[IndustriaX Backend] Killed existing process (PID: ${pid})`);
        } catch {
          // Process already dead, ignore
        }
      }
      unlinkSync(pidFile);
    } catch {
      // Ignore errors
    }
  }
}

// Kill existing process first
killExistingProcess();

console.log(`[IndustriaX Backend] Starting Next.js dev server on port ${port}...`);

const child = spawn("bunx", ["next", "dev", "-p", String(port)], {
  cwd: import.meta.dir,
  stdio: "inherit",
  env: { ...process.env },
});

// Write PID file
writeFileSync(pidFile, String(child.pid));

child.on("error", (err) => {
  console.error(`[IndustriaX Backend] Failed to start: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  console.log(`[IndustriaX Backend] Process exited with code ${code}`);
  try { unlinkSync(pidFile); } catch { /* ignore */ }
  process.exit(code ?? 0);
});

process.on("SIGTERM", () => { child.kill("SIGTERM"); });
process.on("SIGINT", () => { child.kill("SIGINT"); });
