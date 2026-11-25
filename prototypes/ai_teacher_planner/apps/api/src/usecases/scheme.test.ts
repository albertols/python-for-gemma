import fs from "node:fs";
import { IMPORTED, type Merge, type SowItem } from "@planner/domain";
import { syntheticScheme } from "@planner/fixtures";
import { expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import { createRepos } from "../repos/sqlite/index.ts";
import { migratedDb, seededRepos } from "../test-support.ts";
import { firstRun } from "./first-run.ts";
import { saveMerges, saveScheme } from "./scheme.ts";

const COURSE = "ial-business-u4";
const buffer: SowItem = {
  courseId: COURSE,
  id: "buf1",
  order: 2.5,
  kind: "buffer",
  title: "Catch-up",
  lessons: 2,
  track: "core",
  packRefs: [],
  prerequisites: [],
  availableFrom: null,
  note: null,
  assessment: null,
  provenance: IMPORTED,
};
const setup = () => {
  const repos = createRepos(migratedDb());
  firstRun(repos);
  repos.scheme.replace(
    COURSE,
    [...syntheticScheme(COURSE), buffer],
    [{ groupId: "13 3", itemId: "ch4", lessons: 0 }],
  );
  return repos;
};
const merge = (
  id: string,
  first: string,
  second: string,
  groupId = "13 1",
): Merge => ({
  id,
  groupId,
  first,
  second,
});
const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("not refused");
};

test("merges that overlap, name an unknown lesson or include a buffer lesson are refused with a reason, and nothing is saved", () => {
  const repos = setup();
  const e = refusal(() =>
    saveMerges(repos, COURSE, [
      merge("m1", "ch1#2", "ch1#3"),
      merge("m2", "ch1#3", "ch2#1"),
      merge("m3", "ch2#2", "ch2#9"),
      merge("m4", "ch2#4", "buf1#1"),
      merge("m5", "ch4#1", "ch4#2", "13 3"),
      merge("m6", "ch3#1", "ch3#1"),
      merge("m7", "ch3#2", "ch3#3", "11D"),
    ]),
  );
  expect(e).toMatchObject({ status: 422, code: "invalid-merges" });
  expect(e.issues).toEqual([
    'm2: "ch1#3" is already merged in m1.',
    'm3: "ch2#9" is not a lesson of 13 1.',
    'm4: "buf1#1" is a buffer lesson. A buffer lesson can be dropped to make room, so it cannot be merged.',
    'm5: "ch4#1" is not a lesson of 13 3.',
    'm5: "ch4#2" is not a lesson of 13 3.',
    "m6: a lesson cannot be merged with itself.",
    "m7: 11D is not a group of this course.",
  ]);
  expect(repos.decisions.forCourse(COURSE).merges).toEqual([]);
});

test("valid merges are saved, and a later save replaces them", () => {
  const repos = setup();
  const ok = [
    merge("m1", "ch1#2", "ch1#3"),
    merge("m2", "ch2#1", "ch2#2", "13 3"),
  ];
  saveMerges(repos, COURSE, ok);
  expect(repos.decisions.forCourse(COURSE).merges).toEqual(ok);
  saveMerges(repos, COURSE, []);
  expect(repos.decisions.forCourse(COURSE).merges).toEqual([]);
});

test("two merges with one id are refused", () => {
  const repos = setup();
  const e = refusal(() =>
    saveMerges(repos, COURSE, [
      merge("m1", "ch1#2", "ch1#3"),
      merge("m1", "ch2#1", "ch2#2"),
    ]),
  );
  expect(e.issues).toEqual(['The id "m1" is used twice.']);
});

/** The planned world, with the synthetic scheme saved, and what saving it without `gone` says. */
async function deleting(
  gone: string,
  prepare: (
    r: Awaited<ReturnType<typeof seededRepos>>["repos"],
  ) => void = () => {},
) {
  const { repos, packs, dataDir } = await seededRepos("m2-no-positions");
  prepare(repos);
  const stored = repos.scheme.items(COURSE);
  const e = refusal(() =>
    saveScheme(
      repos,
      packs,
      COURSE,
      stored.filter((i) => i.id !== gone),
      repos.scheme.overrides(COURSE),
    ),
  );
  expect(repos.scheme.items(COURSE)).toEqual(stored);
  fs.rmSync(dataDir, { recursive: true, force: true });
  return e;
}

test("a chapter an assessment covers cannot be deleted: 422 with the reason, nothing saved", async () => {
  const e = await deleting("ch1");
  expect(e).toMatchObject({ status: 422, code: "invalid-scheme" });
  expect(e.issues ?? []).toContain(
    '"Demand" cannot be deleted: the assessment "20 mark" covers it.',
  );
});

test("a chapter another item needs first cannot be deleted", async () => {
  const e = await deleting("ch1", (repos) => {
    const items = repos.scheme.items(COURSE);
    repos.scheme.replace(
      COURSE,
      items.map((i) => (i.id === "ch2" ? { ...i, prerequisites: ["ch1"] } : i)),
      [],
    );
  });
  expect((e.issues ?? []).join(" ")).toContain('"Demand" cannot be deleted: ');
  expect((e.issues ?? []).join(" ")).toContain('"Supply" needs it first');
});

test("a chapter with a pin on one of its lessons cannot be deleted", async () => {
  const e = await deleting("ch4", (repos) =>
    repos.decisions.replace(COURSE, "pins", [
      {
        id: "p1",
        groupId: "13 1",
        lessonId: "ch4#1",
        kind: "not-after",
        date: "2026-12-01",
      },
    ]),
  );
  expect(e.issues).toEqual([
    '"Prices" cannot be deleted: a pin holds one of its lessons.',
  ]);
});

test("a chapter with a merge naming one of its lessons cannot be deleted", async () => {
  const e = await deleting("ch4", (repos) =>
    repos.decisions.replace(COURSE, "merges", [
      { id: "m1", groupId: "13 1", first: "ch4#1", second: "ch4#2" },
    ]),
  );
  expect(e.issues).toEqual([
    '"Prices" cannot be deleted: a merge names one of its lessons.',
  ]);
});

test("a chapter a group stands at cannot be deleted", async () => {
  const e = await deleting("ch4", (repos) =>
    repos.facts.setPositions(COURSE, [
      {
        groupId: "13 1",
        nextLessonId: "ch4#1",
        doneItemIds: [],
        asOf: "2026-11-20",
      },
    ]),
  );
  expect(e.issues).toEqual([
    '"Prices" cannot be deleted: a group is at one of its lessons or has finished it.',
  ]);
});

test("a chapter nothing names can be deleted", async () => {
  const { repos, packs, dataDir } = await seededRepos("m2-no-positions");
  const stored = repos.scheme.items(COURSE);
  saveScheme(
    repos,
    packs,
    COURSE,
    stored.filter((i) => i.id !== "ch4"),
    [],
  );
  expect(repos.scheme.items(COURSE).map((i) => i.id)).not.toContain("ch4");
  fs.rmSync(dataDir, { recursive: true, force: true });
});
