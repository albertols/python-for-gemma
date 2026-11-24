import { expect, test } from "vitest";
import { createRepos } from "../repos/sqlite/index.ts";
import { migratedDb } from "../test-support.ts";
import { firstRun } from "./first-run.ts";

test("first run seeds once and never overwrites her edits", () => {
  const repos = createRepos(migratedDb());
  firstRun(repos);
  const [version] = repos.timetable.versions();
  expect(repos.timetable.groups()).toHaveLength(6);
  expect(repos.settings.terms()).toHaveLength(3);
  if (!version) throw new Error("no version");
  repos.timetable.saveVersion({ ...version, entries: [] });
  firstRun(repos);
  expect(repos.timetable.versions()).toHaveLength(1);
  expect(repos.timetable.versions()[0]?.entries).toEqual([]);
});
