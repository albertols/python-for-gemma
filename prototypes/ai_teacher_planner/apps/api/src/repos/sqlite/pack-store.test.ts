import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syntheticPack } from "@planner/fixtures";
import { lockPack } from "@planner/importers";
import { afterAll, expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";
import { createPackStore } from "./pack-store.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const setup = () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-packs-"));
  dirs.push(dataDir);
  const db = migratedDb();
  createRepos(db).courses.seed([
    { id: "ial-business-u4", title: "IAL", board: "IAL", revisionWeeks: 2 },
  ]);
  const dir = path.join(dataDir, "packs");
  return { dir, packs: createPackStore(db, dir) };
};
const pack = () => ({ ...syntheticPack(), courseId: "ial-business-u4" });

test("a draft and a locked pack are two files, and the locked one is read back only while its hash matches", async () => {
  const { dir, packs } = setup();
  expect(packs.draft("ial-business-u4")).toBeNull();
  expect(packs.locked("ial-business-u4")).toBeNull();
  packs.saveDraft(pack());
  expect(packs.draft("ial-business-u4")).toEqual(pack());
  expect(fs.readdirSync(dir)).toEqual(["ial-business-u4.draft.json"]);
  const locked = await lockPack(pack(), new Date("2026-10-26T09:00:00Z"));
  packs.saveLocked(locked);
  expect(packs.locked("ial-business-u4")).toEqual(locked);
  expect(fs.readdirSync(dir).sort()).toEqual([
    "ial-business-u4.draft.json",
    "ial-business-u4.json",
  ]);
  // someone edits the locked file by hand: it is no longer the pack she locked
  const file = path.join(dir, "ial-business-u4.json");
  fs.writeFileSync(file, JSON.stringify({ ...locked, hash: "0".repeat(64) }));
  expect(packs.locked("ial-business-u4")).toBeNull();
  packs.clear();
  expect(fs.readdirSync(dir)).toEqual([]);
});

test("an unlocked pack is refused as locked, and a file that is not a pack is an error", () => {
  const { dir, packs } = setup();
  expect(() => packs.saveLocked(pack())).toThrow(/locked/);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ial-business-u4.draft.json"), "{}");
  expect(() => packs.draft("ial-business-u4")).toThrow();
  expect(() => packs.draft("../escape")).toThrow(/course id/);
});
