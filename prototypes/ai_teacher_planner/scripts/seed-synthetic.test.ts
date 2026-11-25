import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { openDatabase } from "../apps/api/src/db/connection.ts";
import { defaultDataDir, seedSynthetic } from "./seed-synthetic.ts";

test("seeding a fresh folder stores the synthetic calendar", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-seed-"));
  const result = await seedSynthetic({ dataDir: dir });
  expect(result.ok).toBe(true);
  const db = openDatabase(path.join(dir, "planner.sqlite"));
  const row = db.prepare("select count(*) as n from calendar_rows").get() as {
    n: number;
  };
  expect(row.n).toBeGreaterThan(300);
  db.close();
});

test("seeding also fills the synthetic M2 data: a locked pack, the scheme, positions and a first plan", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-seed-"));
  try {
    await seedSynthetic({ dataDir: dir });
    expect(fs.readdirSync(path.join(dir, "packs")).sort()).toEqual([
      "ial-business-u4.draft.json",
      "ial-business-u4.json",
    ]);
    const db = openDatabase(path.join(dir, "planner.sqlite"));
    const count = (table: string) =>
      (db.prepare(`select count(*) as n from ${table}`).get() as { n: number })
        .n;
    expect(count("sow_items")).toBe(6);
    expect(count("positions")).toBe(3);
    expect(count("plan_revisions")).toBe(1);
    expect(count("courses")).toBe(3);
    db.close();
    // seeding the folder again keeps the plan as it is
    await seedSynthetic({ dataDir: dir });
    const again = openDatabase(path.join(dir, "planner.sqlite"));
    expect(
      (
        again.prepare("select count(*) as n from plan_revisions").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    again.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("it refuses the default data folder unless forced", async () => {
  await expect(seedSynthetic({ dataDir: defaultDataDir() })).rejects.toThrow(
    /real planner/,
  );
  await expect(
    seedSynthetic({ dataDir: path.join(defaultDataDir(), "..", "data") }),
  ).rejects.toThrow(/real planner/);
});
