// Fills a data folder with the synthetic school year, through the same use
// cases the routes call: the calendar, then the synthetic M2 data (a locked
// pack, the scheme, positions and a first plan; see seedM2).
// Run: pnpm seed:synthetic --data-dir <dir>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSyntheticWorkbook } from "@planner/fixtures";
import { E2E_MARKER, loadConfig } from "../apps/api/src/config.ts";
import { writeBackup } from "../apps/api/src/db/backup.ts";
import { openDatabase } from "../apps/api/src/db/connection.ts";
import { migrate } from "../apps/api/src/db/migrate.ts";
import { createResourceGateway } from "../apps/api/src/gateway/resource-gateway.ts";
import { createRepos } from "../apps/api/src/repos/sqlite/index.ts";
import { createPackStore } from "../apps/api/src/repos/sqlite/pack-store.ts";
import { firstRun } from "../apps/api/src/usecases/first-run.ts";
import { importCalendar } from "../apps/api/src/usecases/import-calendar.ts";
import { seedM2 } from "../apps/api/src/usecases/seed-m2.ts";

const MIGRATIONS = path.resolve(
  import.meta.dirname,
  "../apps/api/src/db/migrations",
);
const SYNTHETIC_FILE = "Synthetic Secondary Calendar 2026-27.xlsx";

/** The folder the real app uses. Seeding it would overwrite Gemma's data. */
export const defaultDataDir = () => loadConfig({}).dataDir;

export async function seedSynthetic(options: {
  dataDir: string;
  force?: boolean;
}): Promise<{ ok: boolean; counts: { W1: number; W2: number } }> {
  const dataDir = path.resolve(options.dataDir);
  if (dataDir === path.resolve(defaultDataDir()) && !options.force)
    throw new Error(
      `${dataDir} is where the real planner keeps its data. Choose another folder with --data-dir, or pass --force if you really mean it.`,
    );
  fs.mkdirSync(dataDir, { recursive: true });
  // Marks the folder as made for the browser tests; the test reset checks for it.
  fs.writeFileSync(path.join(dataDir, E2E_MARKER), "");
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), "planner-synth-"));
  const db = openDatabase(path.join(dataDir, "planner.sqlite"));
  try {
    fs.writeFileSync(
      path.join(resources, SYNTHETIC_FILE),
      await buildSyntheticWorkbook(),
    );
    const now = () => new Date();
    migrate(db, {
      migrationsDir: MIGRATIONS,
      beforeMigrating: () => writeBackup(db, dataDir, "pre-migration", now()),
    });
    const repos = createRepos(db);
    firstRun(repos);
    const summary = await importCalendar({
      gateway: createResourceGateway(resources),
      repos,
      now,
    });
    // once: a folder seeded before keeps its plan and the revisions made on it
    if (summary.ok && repos.plans.heads().length === 0)
      await seedM2(
        repos,
        createPackStore(db, path.join(dataDir, "packs")),
        now,
      );
    return { ok: summary.ok, counts: summary.counts };
  } finally {
    db.close();
    fs.rmSync(resources, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--data-dir");
  const dataDir = at >= 0 ? args[at + 1] : undefined;
  if (!dataDir) {
    console.error("Usage: pnpm seed:synthetic --data-dir <folder> [--force]");
    process.exit(1);
  }
  try {
    const result = await seedSynthetic({
      dataDir,
      force: args.includes("--force"),
    });
    console.log(
      `Seeded ${dataDir}: import ${result.ok ? "ok" : "FAILED"}, W1 days ${result.counts.W1}, W2 days ${result.counts.W2}.`,
    );
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
