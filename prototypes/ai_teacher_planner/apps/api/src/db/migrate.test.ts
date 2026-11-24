import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { openDatabase } from "./connection.ts";
import { migrate } from "./migrate.ts";

const realDir = path.join(import.meta.dirname, "migrations");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "planner-mig-"));
const tables = (db: ReturnType<typeof openDatabase>) =>
  (
    db.prepare("select name from sqlite_master where type = 'table'").all() as {
      name: string;
    }[]
  )
    .map((r) => r.name)
    .sort();

test("migrating an empty database creates the tables and records the version", () => {
  const db = openDatabase(":memory:");
  const r = migrate(db, { migrationsDir: realDir, beforeMigrating: () => {} });
  expect(r.applied).toEqual([
    "0001_calendar_timetable",
    "0002_report_raw_text",
    "0003_disruptions",
    "0004_calendar_corrections",
    "0005_event_classifications",
    "0006_external_exams",
  ]);
  expect(tables(db)).toEqual(
    expect.arrayContaining([
      "calendar_imports",
      "calendar_rows",
      "disruptions",
      "groups",
      "parents_evenings",
      "report_windows",
      "schema_migrations",
      "settings",
      "terms",
      "timetable_versions",
    ]),
  );
  expect(db.prepare("select version from schema_migrations").all()).toEqual([
    { version: "0001_calendar_timetable" },
    { version: "0002_report_raw_text" },
    { version: "0003_disruptions" },
    { version: "0004_calendar_corrections" },
    { version: "0005_event_classifications" },
    { version: "0006_external_exams" },
  ]);
});

test("migrating twice applies nothing the second time", () => {
  const db = openDatabase(":memory:");
  migrate(db, { migrationsDir: realDir, beforeMigrating: () => {} });
  const second = migrate(db, {
    migrationsDir: realDir,
    beforeMigrating: () => {},
  });
  expect(second.applied).toEqual([]);
});

test("an existing database is backed up before a new migration runs", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "0001_a.sql"), "create table a (x integer);");
  const db = openDatabase(":memory:");
  const calls: string[] = [];
  migrate(db, {
    migrationsDir: dir,
    beforeMigrating: () => calls.push("backup"),
  });
  expect(calls).toEqual([]); // empty database: nothing to protect
  fs.writeFileSync(path.join(dir, "0002_b.sql"), "create table b (x integer);");
  const r = migrate(db, {
    migrationsDir: dir,
    beforeMigrating: () => {
      calls.push("backup");
      expect(tables(db)).not.toContain("b"); // before the SQL runs
    },
  });
  expect(calls).toEqual(["backup"]);
  expect(r.applied).toEqual(["0002_b"]);
});

test("a failing migration leaves the database as it was", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "0001_a.sql"), "create table a (x integer);");
  const db = openDatabase(":memory:");
  migrate(db, { migrationsDir: dir, beforeMigrating: () => {} });
  fs.writeFileSync(
    path.join(dir, "0002_bad.sql"),
    "create table b (x integer); this is not sql;",
  );
  expect(() =>
    migrate(db, { migrationsDir: dir, beforeMigrating: () => {} }),
  ).toThrow();
  expect(tables(db)).not.toContain("b");
  expect(db.prepare("select version from schema_migrations").all()).toEqual([
    { version: "0001_a" },
  ]);
});
