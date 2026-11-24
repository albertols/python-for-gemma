// One-command start. Run: pnpm start
// Builds the web app when it is out of date, starts the API (which also serves
// the web app), waits until it answers, opens the browser and keeps running
// until you press Ctrl+C. PLANNER_NO_OPEN=1 skips opening the browser.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { loadConfig } from "../apps/api/src/config.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const WEB_DIR = path.join(APP_ROOT, "apps/web");

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const t = entry.isDirectory()
      ? newestMtime(full)
      : fs.statSync(full).mtimeMs;
    if (t > newest) newest = t;
  }
  return newest;
}

/** True when dist/index.html is missing or older than any file under src/. */
export function needsBuild(webDir: string): boolean {
  const built = path.join(webDir, "dist", "index.html");
  if (!fs.existsSync(built)) return true;
  return newestMtime(path.join(webDir, "src")) > fs.statSync(built).mtimeMs;
}

type PortState = "free" | "planner" | "other";

async function isPlanner(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = (await res.json()) as { ok?: unknown };
    return res.ok && body.ok === true;
  } catch {
    return false;
  }
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function portState(port: number): Promise<PortState> {
  if (await isPlanner(port)) return "planner";
  return (await accepts(port)) ? "other" : "free";
}

function openBrowser(url: string): void {
  if (process.env.PLANNER_NO_OPEN === "1") return;
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true })
    .on("error", () => console.log(`Open ${url} in your browser.`))
    .unref();
}

async function waitForPlanner(
  port: number,
  child: ChildProcess,
): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) return false;
    if (await isPlanner(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main(): Promise<number> {
  const config = loadConfig(process.env);
  const url = `http://127.0.0.1:${config.port}`;

  const state = await portState(config.port);
  if (state === "planner") {
    console.log(`The planner is already running at ${url}.`);
    openBrowser(url);
    return 0;
  }
  if (state === "other") {
    console.error(
      `Port ${config.port} is in use by something that is not the planner. Close it, or start the planner on another port with PLANNER_PORT=<number>.`,
    );
    return 1;
  }

  if (needsBuild(WEB_DIR)) {
    console.log("Building the web app...");
    const build = spawnSync("pnpm", ["--filter", "@planner/web", "build"], {
      cwd: APP_ROOT,
      stdio: "inherit",
    });
    if (build.status !== 0) {
      console.error("The web app did not build. See the messages above.");
      return 1;
    }
  }

  const api = spawn(
    process.execPath,
    [path.join(APP_ROOT, "apps/api/src/main.ts")],
    { cwd: APP_ROOT, stdio: "inherit", env: process.env },
  );
  const stop = () => api.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const exited = new Promise<number>((resolve) =>
    api.on("exit", (code) => resolve(code ?? 0)),
  );

  if (!(await waitForPlanner(config.port, api))) {
    stop();
    console.error("The planner did not start. See the messages above.");
    return 1;
  }
  console.log(`The planner is running at ${url}. Press Ctrl+C to stop it.`);
  openBrowser(url);
  return exited;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    process.exit(await main());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
