import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiProvider } from "@planner/ai";
import { TEACHER_PRINCIPAL } from "@planner/domain";
import { buildSyntheticWorkbook, syntheticSpecPdf } from "@planner/fixtures";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/connection.ts";
import { migrate } from "./db/migrate.ts";
import {
  CALENDAR_WORKBOOK_PATTERN,
  isPlanningFile,
  matchesGlob,
  TIMETABLE_IMAGE_PATTERN,
} from "./gateway/allowlist.ts";
import {
  ResourceDenied,
  type ResourceGateway,
} from "./gateway/resource-gateway.ts";
import { createRepos } from "./repos/sqlite/index.ts";
import { createPackStore } from "./repos/sqlite/pack-store.ts";
import type { Principal } from "./routes/require-access.ts";
import { resetToSeed } from "./usecases/reset-to-seed.ts";
import type { SeedState } from "./usecases/seed-m2.ts";

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
      if (pattern === "planning-files")
        return Object.keys(files)
          .filter((name) => isPlanningFile(name.split("/")))
          .sort();
      const glob =
        pattern === "calendar-workbook"
          ? CALENDAR_WORKBOOK_PATTERN
          : TIMETABLE_IMAGE_PATTERN;
      return Object.keys(files).filter((name) => matchesGlob(glob, [name]));
    },
  };
}

export const SYNTHETIC_FILE = "Synthetic Secondary Calendar 2026-27.xlsx";

/** An allowlisted specification path (invented bytes) and a textbook path the allowlist refuses. */
export const SYNTHETIC_SPEC_PATH =
  "ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf";
export const TEXTBOOK_PATH = "ial/ial Specification & Textbook/Textbook.pdf";

/** The synthetic calendar and the two-page synthetic specification; `extra` adds or replaces files. */
export async function syntheticGateway(
  extra: Record<string, Uint8Array> = {},
): Promise<ResourceGateway> {
  return fakeGateway({
    [SYNTHETIC_FILE]: await buildSyntheticWorkbook(),
    [SYNTHETIC_SPEC_PATH]: syntheticSpecPdf(),
    ...extra,
  });
}

export async function buildTestApp(
  over: Partial<Config> = {},
  gateway?: ResourceGateway,
  now = "2026-11-24T10:00:00Z",
  principal: Principal = TEACHER_PRINCIPAL,
  ai: AiProvider | null = null,
) {
  return createApp({
    ai,
    config: { ...testConfig, ...over },
    db: migratedDb(),
    now: () => new Date(now),
    gateway: gateway ?? (await syntheticGateway()),
    principal,
  });
}

/**
 * A migrated database with a pack folder in a new temporary data folder, seeded
 * as the browser-test reset does for `state`. The caller removes `dataDir`.
 */
export async function seededRepos(state: SeedState) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-seeded-"));
  const db = migratedDb();
  const repos = createRepos(db);
  const packs = createPackStore(db, path.join(dataDir, "packs"));
  await resetToSeed(
    db,
    repos,
    { packs, dataDir },
    () => new Date("2026-11-24T10:00:00Z"),
    state,
  );
  return { db, repos, packs, dataDir };
}
