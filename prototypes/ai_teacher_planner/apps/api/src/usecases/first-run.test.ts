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

test("a failure part-way through seeding stores nothing and leaves the flag unset", () => {
  const repos = createRepos(migratedDb());
  const failing = {
    ...repos,
    timetable: {
      ...repos.timetable,
      seed(...args: Parameters<typeof repos.timetable.seed>) {
        repos.timetable.seed(...args); // stored, then the seed dies
        throw new Error("disk full");
      },
    },
  };
  expect(() => firstRun(failing)).toThrow("disk full");
  expect(repos.timetable.versions()).toEqual([]);
  expect(repos.timetable.groups()).toEqual([]);
  expect(repos.settings.terms()).toEqual([]);
  expect(repos.settings.getFlag("seeded")).toBe(false);
  firstRun(repos);
  expect(repos.timetable.versions()).toHaveLength(1);
});
