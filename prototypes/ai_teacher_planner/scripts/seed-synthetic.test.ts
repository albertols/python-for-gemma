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

test("it refuses the default data folder unless forced", async () => {
  await expect(seedSynthetic({ dataDir: defaultDataDir() })).rejects.toThrow(
    /real planner/,
  );
  await expect(
    seedSynthetic({ dataDir: path.join(defaultDataDir(), "..", "data") }),
  ).rejects.toThrow(/real planner/);
});
