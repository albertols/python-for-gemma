import { IMPORTED, type Merge, type SowItem } from "@planner/domain";
import { syntheticScheme } from "@planner/fixtures";
import { expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import { createRepos } from "../repos/sqlite/index.ts";
import { migratedDb } from "../test-support.ts";
import { firstRun } from "./first-run.ts";
import { saveMerges } from "./scheme.ts";

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
