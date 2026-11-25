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
  // the hash field in the locked file no longer matches the stored hash: not the pack she locked
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
  expect(() => packs.draft("ial-business-u4")).toThrow(
    /The pack file could not be read: ial-business-u4\.draft\.json, /,
  );
  expect(() => packs.draft("../escape")).toThrow(/course id/);
});

test("the notes saved beside a draft are read back", () => {
  const { dir, packs } = setup();
  expect(packs.draftReview("ial-business-u4")).toBeNull();
  fs.mkdirSync(dir, { recursive: true });
  // what `pnpm pack:draft` writes: the notes, the issues and the run's meta (with a field the store ignores)
  fs.writeFileSync(
    path.join(dir, "ial-business-u4.draft-review.json"),
    JSON.stringify({
      issues: ["one"],
      linkReasons: [
        { chapterNumber: "1", specPointId: "sp1", reason: "Names the topic." },
      ],
      unsure: [{ about: "1.2", note: "Two readings." }],
      meta: {
        provider: "fake",
        model: "fake",
        skillId: "planner-build-curriculum-pack",
        startedAt: "2026-11-24T09:00:00.000Z",
        durationMs: 12,
        sources: [],
      },
    }),
  );
  expect(packs.draftReview("ial-business-u4")).toEqual({
    linkReasons: [
      { chapterNumber: "1", specPointId: "sp1", reason: "Names the topic." },
    ],
    unsure: [{ about: "1.2", note: "Two readings." }],
    meta: {
      provider: "fake",
      model: "fake",
      skillId: "planner-build-curriculum-pack",
      startedAt: "2026-11-24T09:00:00.000Z",
      sources: [],
    },
    checkedUnits: [],
  });
  fs.writeFileSync(
    path.join(dir, "ial-business-u4.draft-review.json"),
    "{ not json",
  );
  expect(() => packs.draftReview("ial-business-u4")).toThrow(
    "The pack file could not be read: ial-business-u4.draft-review.json is not JSON.",
  );
});

test("checked units are kept in the notes file, which is made if there is none, and other notes are kept", () => {
  const { dir, packs } = setup();
  packs.saveCheckedUnits("ial-business-u4", ["u1"]);
  expect(packs.draftReview("ial-business-u4")).toEqual({
    linkReasons: [],
    unsure: [],
    meta: null,
    checkedUnits: ["u1"],
  });
  const notes = {
    linkReasons: [
      { chapterNumber: "1", specPointId: "sp1", reason: "Names the topic." },
    ],
    unsure: [],
    meta: null,
    checkedUnits: [],
  };
  packs.saveDraftReview("ial-business-u4", notes);
  packs.saveCheckedUnits("ial-business-u4", ["u2", "u1"]);
  expect(packs.draftReview("ial-business-u4")).toEqual({
    ...notes,
    checkedUnits: ["u2", "u1"],
  });
  expect(fs.readdirSync(dir)).toEqual(["ial-business-u4.draft-review.json"]);
});
