import { buildSyntheticWorkbook } from "@planner/fixtures";
import type { Database } from "../db/connection.ts";
import {
  ResourceDenied,
  type ResourceGateway,
} from "../gateway/resource-gateway.ts";
import type { Repos } from "../repos/ports.ts";
import { firstRun } from "./first-run.ts";
import { importCalendar } from "./import-calendar.ts";

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

/**
 * For the browser tests only: empties every table, then stores her timetable and
 * terms again and imports the synthetic calendar, as `pnpm seed:synthetic` does.
 */
export async function resetToSeed(
  db: Database,
  repos: Repos,
  now: () => Date,
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
  firstRun(repos);
  await importCalendar({
    gateway: syntheticGateway(await buildSyntheticWorkbook()),
    repos,
    now,
  });
}
