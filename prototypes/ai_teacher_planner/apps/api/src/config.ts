import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type IsoDate, isIsoDate } from "@planner/domain";

export interface Config {
  dataDir: string;
  resourcesDir: string;
  port: number;
  host: "127.0.0.1";
  ai: "claude" | "fake" | "off";
  fixedToday: IsoDate | null;
  timeZone: string;
  /** Adds POST /api/test/reset. Only the browser tests set it. */
  testRoutes: boolean;
}

const APP_ROOT = path.resolve(import.meta.dirname, "../../..");
const AI_MODES = ["claude", "fake", "off"] as const;

/** The seed script writes this into a data folder made for the browser tests. */
export const E2E_MARKER = ".e2e-seeded";

const realPath = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/**
 * The test reset wipes the database, so it is allowed only on a folder that the
 * browser-test seed made (it holds the marker) and that lives under the system
 * temporary folder. Anything else, such as her real data, refuses to start.
 */
function checkTestRoutesAllowed(dataDir: string): void {
  const refusal = (why: string) =>
    new Error(
      `PLANNER_TEST_ROUTES=1 is refused: ${why}. It is only for the browser tests, on a temporary seeded folder.`,
    );
  if (!fs.existsSync(path.join(dataDir, E2E_MARKER)))
    throw refusal(`${dataDir} was not seeded for the browser tests`);
  const tmp = realPath(os.tmpdir());
  const dir = realPath(dataDir);
  if (dir !== tmp && !dir.startsWith(tmp + path.sep))
    throw refusal(`${dataDir} is not under the temporary folder`);
}

function checkedTimeZone(name: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: name });
  } catch {
    throw new Error(`PLANNER_TIME_ZONE "${name}" is not a time zone`);
  }
  return name;
}

/** Reads the environment once. The host is never configurable: the app is loopback only. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const ai = env.PLANNER_AI ?? "claude";
  if (!(AI_MODES as readonly string[]).includes(ai)) {
    throw new Error(`PLANNER_AI must be one of ${AI_MODES.join(", ")}`);
  }
  const port = Number(env.PLANNER_PORT ?? 4319);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PLANNER_PORT must be a whole number from 1 to 65535");
  }
  const fixed = env.PLANNER_FIXED_TODAY;
  if (fixed !== undefined && !isIsoDate(fixed)) {
    throw new Error("PLANNER_FIXED_TODAY must look like 2026-11-20");
  }
  const dataDir = env.PLANNER_DATA_DIR ?? path.join(APP_ROOT, "data");
  const testRoutes = env.PLANNER_TEST_ROUTES === "1";
  if (testRoutes) checkTestRoutesAllowed(dataDir);
  return {
    dataDir,
    resourcesDir:
      env.PLANNER_RESOURCES_DIR ?? path.resolve(APP_ROOT, "../resources"),
    port,
    host: "127.0.0.1",
    ai: ai as Config["ai"],
    fixedToday: fixed ?? null,
    testRoutes,
    timeZone: checkedTimeZone(
      env.PLANNER_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
  };
}
