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
  return {
    dataDir: env.PLANNER_DATA_DIR ?? path.join(APP_ROOT, "data"),
    resourcesDir:
      env.PLANNER_RESOURCES_DIR ?? path.resolve(APP_ROOT, "../resources"),
    port,
    host: "127.0.0.1",
    ai: ai as Config["ai"],
    fixedToday: fixed ?? null,
    testRoutes: env.PLANNER_TEST_ROUTES === "1",
    timeZone: checkedTimeZone(
      env.PLANNER_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
  };
}
