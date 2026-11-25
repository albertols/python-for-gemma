import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

const ial = {
  id: "ial-business-u4",
  title: "IAL Business Unit 4",
  board: "IAL" as const,
  revisionWeeks: 2,
};
const ib = { ...ial, id: "ib-business", title: "IB", board: "IB" as const };

test("courses are seeded once, listed by id, and a later seed never changes one she edited", () => {
  const { courses } = createRepos(migratedDb());
  expect(courses.list()).toEqual([]);
  courses.seed([ib, ial]);
  expect(courses.list().map((c) => c.id)).toEqual([
    "ial-business-u4",
    "ib-business",
  ]);
  expect(courses.get("ial-business-u4")).toEqual(ial);
  expect(courses.setRevisionWeeks("ial-business-u4", 0)).toBe(true);
  courses.seed([ial]);
  expect(courses.get("ial-business-u4")?.revisionWeeks).toBe(0);
  expect(courses.setRevisionWeeks("nope", 1)).toBe(false);
  expect(courses.get("nope")).toBeNull();
});
