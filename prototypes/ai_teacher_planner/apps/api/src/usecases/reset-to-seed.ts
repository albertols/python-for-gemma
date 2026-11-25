import fs from "node:fs";
import path from "node:path";
import { buildSyntheticWorkbook } from "@planner/fixtures";
import type { Database } from "../db/connection.ts";
import {
  ResourceDenied,
  type ResourceGateway,
} from "../gateway/resource-gateway.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { firstRun } from "./first-run.ts";
import { importCalendar } from "./import-calendar.ts";
import { type SeedState, seedM2 } from "./seed-m2.ts";

const FILE = "Synthetic Secondary Calendar 2026-27.xlsx";

/** A gateway over one synthetic workbook held in memory. It never touches the disk. */
function syntheticGateway(bytes: Uint8Array): ResourceGateway {
  return {
    isAllowed: (p) => p === FILE,
    async read(p) {
      if (p !== FILE) throw new ResourceDenied(p);
      return bytes;
    },
    async list() {
      return [
        {
          name: FILE,
          kind: "file",
          modifiedAt: "2026-11-20T00:00:00.000Z",
          size: bytes.length,
        },
      ];
    },
    async find(pattern) {
      return pattern === "calendar-workbook" ? [FILE] : [];
    },
  };
}

/** Removes everything inside a folder of the data folder, keeping the folder. */
function emptyFolder(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir))
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
}

/**
 * For the browser tests only: empties every table, the pack files and the
 * lesson materials, then stores her timetable, terms and courses again and
 * imports the synthetic calendar. That is `"m1b"`, what every M1 and M1b
 * scenario expects; the M2 states add the synthetic M2 data on top (`seedM2`).
 */
export async function resetToSeed(
  db: Database,
  repos: Repos,
  stores: { packs: PackStore; dataDir: string },
  now: () => Date,
  state: SeedState = "m1b",
): Promise<void> {
  const tables = db
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != 'schema_migrations'",
    )
    .all() as { name: string }[];
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const { name } of tables) db.exec(`delete from "${name}"`);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  stores.packs.clear();
  emptyFolder(path.join(stores.dataDir, "materials"));
  firstRun(repos);
  await importCalendar({
    gateway: syntheticGateway(await buildSyntheticWorkbook()),
    repos,
    now,
  });
  if (state !== "m1b") await seedM2(repos, stores.packs, now, state);
}
