import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { createRepos } from "../repos/sqlite/index.ts";
import { createPackStore } from "../repos/sqlite/pack-store.ts";
import { migratedDb } from "../test-support.ts";
import { createDisruption } from "./disruptions.ts";
import { loadPlanInputs } from "./plan-inputs.ts";
import { resetToSeed } from "./reset-to-seed.ts";
import type { SeedState } from "./seed-m2.ts";

const COURSE = "ial-business-u4";
const now = () => new Date("2026-11-24T10:00:00Z");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** A migrated database and pack folder, seeded as the browser-test reset does. */
async function seeded(state: SeedState) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-inputs-"));
  dirs.push(dataDir);
  const db = migratedDb();
  const repos = createRepos(db);
  const packs = createPackStore(db, path.join(dataDir, "packs"));
  await resetToSeed(db, repos, { packs, dataDir }, now, state);
  return { repos, packs };
}

test("the inputs come from the database: her cancellations in the slots, the course's groups, exams and revision weeks, and the head", async () => {
  const { repos, packs } = await seeded("m2-planned");
  createDisruption(
    repos,
    {
      scope: "groups",
      groupIds: ["13 1"],
      from: "2026-11-23",
      to: "2026-11-23",
      periods: null,
      reason: "Trip",
    },
    now(),
  );
  repos.courses.setRevisionWeeks(COURSE, 3);
  const inputs = loadPlanInputs(repos, packs, COURSE, "2026-11-20");
  expect(inputs.today).toBe("2026-11-20");
  expect(inputs.groups.map((g) => g.id)).toEqual(["13 1", "13 3", "13 5"]);
  expect(new Set(inputs.slots.map((s) => s.groupId))).toEqual(
    new Set(["13 1", "13 3", "13 5"]),
  );
  expect(inputs.slots.find((s) => s.key === "13 1|2026-11-23|5")?.status).toBe(
    "cancelled",
  );
  // only the exam her IAL groups sit, not the IGCSE papers
  expect(inputs.exams.map((e) => e.code)).toEqual(["WBS14 01"]);
  expect(inputs.revisionWeeks).toBe(3);
  expect(inputs.blocks.map((b) => b.id)).toContain("T1b");
  expect(inputs.items.map((i) => i.id)).toEqual([
    "ch1",
    "ch2",
    "a-ch2",
    "ch3",
    "a-ch3",
    "ch4",
  ]);
  expect(inputs.positions).toHaveLength(3);
  expect(inputs.previous).toEqual(repos.plans.head(COURSE)?.snapshot);
});

test("there is nothing to plan before the pack is locked", async () => {
  const { repos, packs } = await seeded("m2-draft-pack");
  expect(() => loadPlanInputs(repos, packs, COURSE, "2026-11-20")).toThrow(
    expect.objectContaining({ status: 409, code: "pack-not-locked" }),
  );
  expect(() => loadPlanInputs(repos, packs, "nope", "2026-11-20")).toThrow(
    expect.objectContaining({ status: 404 }),
  );
});

test("each seed state holds what it says, and no more", async () => {
  const draft = await seeded("m2-draft-pack");
  expect(draft.packs.locked(COURSE)).toBeNull();
  expect(
    draft.packs.draft(COURSE)?.chapters.find((c) => c.id === "ch5")
      ?.specPointIds,
  ).toEqual([]);
  expect(draft.repos.scheme.items(COURSE)).toEqual([]);

  const noPositions = await seeded("m2-no-positions");
  expect(noPositions.packs.locked(COURSE)?.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(noPositions.repos.scheme.items(COURSE)).toHaveLength(6);
  expect(noPositions.repos.facts.positions(COURSE)).toEqual([]);
  expect(noPositions.repos.plans.head(COURSE)).toBeNull();

  const planned = await seeded("m2-planned");
  expect(
    planned.repos.facts
      .positions(COURSE)
      .map((p) => [p.groupId, p.nextLessonId, p.asOf]),
  ).toEqual([
    ["13 1", "ch1#1", "2026-10-26"],
    ["13 3", "ch1#1", "2026-10-26"],
    ["13 5", "ch1#1", "2026-10-26"],
  ]);
  const head = planned.repos.plans.head(COURSE);
  expect(head).toMatchObject({ parentId: null, label: "First plan" });
  expect(head?.snapshot.today).toBe("2026-10-26");
  // the spare lesson before a-ch2 that Task 2.21 checks on the board
  expect(
    head?.snapshot.placements.filter((p) => p.lessonId.includes(":cp:a-ch2#")),
  ).toEqual([
    expect.objectContaining({
      groupId: "13 3",
      lessonId: "flex:13 3:cp:a-ch2#1",
      slotKey: "13 3|2026-11-26|4",
    }),
  ]);

  const m1b = await seeded("m1b");
  expect(m1b.repos.courses.list()).toHaveLength(3);
  expect(m1b.packs.draft(COURSE)).toBeNull();
  expect(m1b.repos.scheme.items(COURSE)).toEqual([]);
  expect(m1b.repos.plans.heads()).toEqual([]);
});
