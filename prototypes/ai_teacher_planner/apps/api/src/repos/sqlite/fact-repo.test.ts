import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

test("positions are replaced per course, and the log keeps every entry in the order recorded", () => {
  const repos = createRepos(migratedDb());
  repos.courses.seed([
    { id: "a", title: "A", board: "IAL", revisionWeeks: 2 },
    { id: "b", title: "B", board: "IB", revisionWeeks: 2 },
  ]);
  const at = (groupId: string, next: string | null) => ({
    groupId,
    nextLessonId: next,
    doneItemIds: next === null ? [] : ["ch9"],
    asOf: "2026-10-26",
  });
  repos.facts.setPositions("a", [at("13 3", "ch1#1"), at("13 1", null)]);
  repos.facts.setPositions("b", [at("IB S", "u1#1")]);
  expect(repos.facts.positions("a")).toEqual([
    at("13 1", null),
    at("13 3", "ch1#1"),
  ]);
  repos.facts.setPositions("a", [at("13 1", "ch2#1")]);
  expect(repos.facts.positions("a")).toEqual([at("13 1", "ch2#1")]);
  expect(repos.facts.positions("b")).toHaveLength(1);

  const entry = (lessonId: string, outcome: "taught" | "skipped") => ({
    groupId: "13 1",
    lessonId,
    slotKey: `13 1|2026-11-09|5`,
    outcome,
    recordedOn: "2026-11-20",
    note: outcome === "skipped" ? "Fire drill" : null,
  });
  repos.facts.append([entry("ch1#2", "skipped"), entry("ch1#1", "taught")]);
  repos.facts.append([{ ...entry("u1#1", "taught"), groupId: "IB S" }]);
  expect(repos.facts.log(["13 1"])).toEqual([
    { ...entry("ch1#2", "skipped"), seq: 1 },
    { ...entry("ch1#1", "taught"), seq: 2 },
  ]);
  // seq is the row id: it only grows, across groups too
  expect(repos.facts.log(["IB S", "13 1"]).map((e) => e.seq)).toEqual([
    1, 2, 3,
  ]);
  expect(repos.facts.log([])).toEqual([]);
});
