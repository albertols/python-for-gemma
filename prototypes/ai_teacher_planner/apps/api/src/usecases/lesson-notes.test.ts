import { expect, test } from "vitest";
import { createRepos } from "../repos/sqlite/index.ts";
import { migratedDb } from "../test-support.ts";
import { firstRun } from "./first-run.ts";
import { removedFromPlan } from "./lesson-notes.ts";

test("a removed note whose group is gone from the timetable is listed and marked, not lost", () => {
  const repos = createRepos(migratedDb());
  firstRun(repos);
  repos.lessonNotes.saveText(
    "13 1",
    "ch9#1",
    "Still here",
    "Markets, lesson 1 of 2",
    "t",
  );
  // written when the class existed; the class has since left the timetable
  repos.lessonNotes.saveText(
    "9 Z",
    "ch9#2",
    "Old class",
    "Markets, lesson 2 of 2",
    "t",
  );
  const items = removedFromPlan(repos);
  expect(items.map((i) => [i.groupId, i.groupMissing])).toEqual([
    ["13 1", false],
    ["9 Z", true],
  ]);
  expect(items[1]).toMatchObject({
    text: "Old class",
    title: "Markets, lesson 2 of 2",
  });
});
