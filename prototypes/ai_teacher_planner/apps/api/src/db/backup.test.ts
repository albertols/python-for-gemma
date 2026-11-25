import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  backupDatabase,
  describeStartupError,
  hasDailyBackup,
  pruneBackups,
} from "./backup.ts";
import { openDatabase } from "./connection.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "planner-bak-"));

test("backup writes a readable copy and prune keeps the newest seven", async () => {
  const dataDir = tmp();
  const file = path.join(dataDir, "planner.sqlite");
  const db = openDatabase(file);
  db.exec("create table t (x text); insert into t values ('kept');");
  const made: string[] = [];
  for (let i = 0; i < 10; i++) {
    made.push(
      await backupDatabase(
        db,
        dataDir,
        "daily",
        new Date(Date.UTC(2026, 10, 10 + i, 8, 0, 0)),
      ),
    );
  }
  expect(path.basename(made[0] as string)).toBe(
    "planner-20261110-080000-daily.sqlite",
  );
  const copy = openDatabase(made[9] as string);
  expect(copy.prepare("select x from t").all()).toEqual([{ x: "kept" }]);
  copy.close();

  const removed = pruneBackups(dataDir, 7);
  expect(removed.map((f) => path.basename(f))).toEqual([
    "planner-20261110-080000-daily.sqlite",
    "planner-20261111-080000-daily.sqlite",
    "planner-20261112-080000-daily.sqlite",
  ]);
  expect(fs.readdirSync(path.join(dataDir, "backups"))).toHaveLength(7);
  db.close();
});

test("a corrupt database gives one readable line naming the file and the newest backup", async () => {
  const dataDir = tmp();
  const db = openDatabase(path.join(dataDir, "planner.sqlite"));
  await backupDatabase(db, dataDir, "daily", new Date("2026-11-20T08:00:00Z"));
  const sqliteCorruptError = Object.assign(
    new Error("file is not a database"),
    {
      code: "SQLITE_NOTADB",
    },
  );
  const line = describeStartupError(sqliteCorruptError, dataDir);
  expect(line).toMatch(/planner\.sqlite.*backups\//s);
  expect(line).toContain("planner-20261120-080000-daily.sqlite");
  expect(line).not.toContain("\n");
  db.close();
});

test("other start-up errors are one line too", () => {
  const busy = Object.assign(new Error("listen EADDRINUSE"), {
    code: "EADDRINUSE",
  });
  expect(describeStartupError(busy, "/x")).not.toContain("\n");
  expect(describeStartupError(new Error("boom"), "/x")).toContain("boom");
});

test("hasDailyBackup counts a 23:30 UTC backup for the next Madrid day, and never a pre-migration one", async () => {
  const dataDir = tmp();
  const db = openDatabase(path.join(dataDir, "planner.sqlite"));
  await backupDatabase(
    db,
    dataDir,
    "pre-migration",
    new Date("2026-11-20T09:00:00Z"),
  );
  expect(hasDailyBackup(dataDir, "2026-11-20", "Europe/Madrid")).toBe(false);
  await backupDatabase(db, dataDir, "daily", new Date("2026-11-20T23:30:00Z"));
  expect(hasDailyBackup(dataDir, "2026-11-21", "Europe/Madrid")).toBe(true);
  expect(hasDailyBackup(dataDir, "2026-11-20", "Europe/Madrid")).toBe(false);
  db.close();
});
