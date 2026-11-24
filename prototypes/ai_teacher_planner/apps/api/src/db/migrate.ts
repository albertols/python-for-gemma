import fs from "node:fs";
import path from "node:path";
import type { Database } from "./connection.ts";

/**
 * Applies pending `NNNN_name.sql` files in order, each in its own transaction.
 * `beforeMigrating` runs once, before any SQL, and only when there is something
 * pending on a database that already has a recorded version.
 */
export function migrate(
  db: Database,
  opts: { migrationsDir: string; beforeMigrating: () => void },
): { applied: string[] } {
  db.exec(
    "create table if not exists schema_migrations (version text primary key)",
  );
  const done = new Set(
    (
      db.prepare("select version from schema_migrations").all() as {
        version: string;
      }[]
    ).map((r) => r.version),
  );
  const pending = fs
    .readdirSync(opts.migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => f.slice(0, -".sql".length))
    .filter((v) => !done.has(v));
  if (pending.length === 0) return { applied: [] };
  if (done.size > 0) opts.beforeMigrating();

  const record = db.prepare(
    "insert into schema_migrations (version) values (?)",
  );
  for (const version of pending) {
    const sql = fs.readFileSync(
      path.join(opts.migrationsDir, `${version}.sql`),
      "utf8",
    );
    db.transaction(() => {
      db.exec(sql);
      record.run(version);
    })();
  }
  return { applied: pending };
}
