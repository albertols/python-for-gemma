import { syntheticScheme } from "@planner/fixtures";
import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

test("a scheme comes back as stored, items by order and overrides by group, and a replace is whole", () => {
  const repos = createRepos(migratedDb());
  repos.courses.seed([{ id: "c", title: "C", board: "IAL", revisionWeeks: 2 }]);
  const items = syntheticScheme("c");
  repos.scheme.replace("c", [...items].reverse(), [
    { groupId: "13 3", itemId: "ch2", lessons: 5 },
    { groupId: "13 1", itemId: "ch4", lessons: 0 },
  ]);
  expect(repos.scheme.items("c")).toEqual(items);
  expect(repos.scheme.overrides("c")).toEqual([
    { groupId: "13 1", itemId: "ch4", lessons: 0 },
    { groupId: "13 3", itemId: "ch2", lessons: 5 },
  ]);
  repos.scheme.replace("c", items.slice(0, 1), []);
  expect(repos.scheme.items("c").map((i) => i.id)).toEqual(["ch1"]);
  expect(repos.scheme.overrides("c")).toEqual([]);
  expect(repos.scheme.items("other")).toEqual([]);
});
