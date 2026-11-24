// Starts the planner for the browser tests: a fresh temporary data folder filled
// with the synthetic school year, an empty resources folder (never the real one),
// and the API on its own port. Playwright's webServer runs this file.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "../..");
const port = process.env.E2E_PORT ?? "4320";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "planner-e2e-"));
const dataDir = path.join(tmp, "data");
const resourcesDir = path.join(tmp, "resources");
fs.mkdirSync(resourcesDir);

function cleanUp() {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const seed = spawnSync(
  process.execPath,
  ["scripts/seed-synthetic.ts", "--data-dir", dataDir],
  { cwd: APP_ROOT, stdio: "inherit" },
);
if (seed.status !== 0) {
  cleanUp();
  process.exit(seed.status ?? 1);
}

const api = spawn(process.execPath, ["apps/api/src/main.ts"], {
  cwd: APP_ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    PLANNER_PORT: port,
    PLANNER_DATA_DIR: dataDir,
    PLANNER_RESOURCES_DIR: resourcesDir,
    PLANNER_AI: "fake",
    PLANNER_FIXED_TODAY: "2026-11-20",
    PLANNER_TEST_ROUTES: "1",
  },
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.on(signal, stop);
api.on("exit", (code) => {
  cleanUp();
  process.exit(stopping ? 0 : (code ?? 1));
});
