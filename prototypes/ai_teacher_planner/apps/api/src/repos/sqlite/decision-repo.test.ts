import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

test("decisions are kept per course and kind, sorted by key, and a replace touches one kind only", () => {
  const repos = createRepos(migratedDb());
  repos.courses.seed([
    { id: "a", title: "A", board: "IAL", revisionWeeks: 2 },
    { id: "b", title: "B", board: "IB", revisionWeeks: 2 },
  ]);
  const empty = {
    pins: [],
    merges: [],
    flexEdits: [],
    coverChoices: [],
    homework: [],
    holds: [],
  };
  expect(repos.decisions.forCourse("a")).toEqual(empty);
  repos.decisions.replace("a", "merges", [
    { id: "m2", groupId: "13 1", first: "ch1#2", second: "ch1#3" },
    { id: "m1", groupId: "13 3", first: "ch2#1", second: "ch2#2" },
  ]);
  repos.decisions.replace("a", "pins", [
    {
      id: "p1",
      groupId: "13 1",
      lessonId: "ch3#1",
      kind: "not-after",
      date: "2026-12-01",
    },
  ]);
  repos.decisions.replace("a", "flexEdits", [
    {
      flexId: "flex:13 1:cp:a-ch2#1",
      title: "Past paper",
      purpose: "exam-practice",
    },
  ]);
  const a = repos.decisions.forCourse("a");
  expect(a.merges.map((m) => m.id)).toEqual(["m1", "m2"]);
  expect(a.pins).toEqual([
    {
      id: "p1",
      groupId: "13 1",
      lessonId: "ch3#1",
      kind: "not-after",
      date: "2026-12-01",
    },
  ]);
  expect(a.flexEdits[0]?.title).toBe("Past paper");
  expect(repos.decisions.forCourse("b")).toEqual(empty);
  repos.decisions.replace("a", "merges", []);
  expect(repos.decisions.forCourse("a").merges).toEqual([]);
  expect(repos.decisions.forCourse("a").pins).toHaveLength(1);
});
