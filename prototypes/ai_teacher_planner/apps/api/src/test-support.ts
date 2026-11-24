import path from "node:path";
import { TEACHER_PRINCIPAL } from "@planner/domain";
import { buildSyntheticWorkbook } from "@planner/fixtures";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/connection.ts";
import { migrate } from "./db/migrate.ts";
import {
  ResourceDenied,
  type ResourceGateway,
} from "./gateway/resource-gateway.ts";
import type { Principal } from "./routes/require-access.ts";

export const testConfig: Config = loadConfig({
  PLANNER_DATA_DIR: "/unused",
  PLANNER_TIME_ZONE: "Europe/Madrid",
});

/** A migrated in-memory database. */
export function migratedDb() {
  const db = openDatabase(":memory:");
  migrate(db, {
    migrationsDir: path.join(import.meta.dirname, "db/migrations"),
    beforeMigrating: () => {},
  });
  return db;
}

/** A gateway over a few named files in memory. It never touches the disk. */
export function fakeGateway(
  files: Record<string, Uint8Array>,
): ResourceGateway {
  return {
    isAllowed: (p) => p in files,
    async read(p) {
      const bytes = files[p];
      if (!bytes) throw new ResourceDenied(p);
      return bytes;
    },
    async list() {
      return Object.keys(files).map((name) => ({
        name,
        kind: "file" as const,
        modifiedAt: "2026-11-20T00:00:00.000Z",
        size: files[name]?.length ?? 0,
      }));
    },
    async find(pattern) {
      return pattern === "calendar-workbook" ? Object.keys(files) : [];
    },
  };
}

export const SYNTHETIC_FILE = "Synthetic Secondary Calendar 2026-27.xlsx";

export async function syntheticGateway(): Promise<ResourceGateway> {
  return fakeGateway({ [SYNTHETIC_FILE]: await buildSyntheticWorkbook() });
}

export async function buildTestApp(
  over: Partial<Config> = {},
  gateway?: ResourceGateway,
  now = "2026-11-24T10:00:00Z",
  principal: Principal = TEACHER_PRINCIPAL,
) {
  return createApp({
    config: { ...testConfig, ...over },
    db: migratedDb(),
    now: () => new Date(now),
    gateway: gateway ?? (await syntheticGateway()),
    principal,
  });
}
