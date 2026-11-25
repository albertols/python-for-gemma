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

test("first run seeds the three exams once, and one she deleted is never added back", () => {
  const repos = createRepos(migratedDb());
  firstRun(repos);
  expect(repos.exams.list().map((e) => e.code)).toEqual([
    "4BS1 01",
    "4BS1 02",
    "WBS14 01",
  ]);
  const wbs = repos.exams.list().find((e) => e.code === "WBS14 01");
  expect(wbs).toMatchObject({
    date: "2027-06-01",
    session: "morning",
    durationMinutes: 120,
    groupIds: ["13 1", "13 3", "13 5"],
  });
  expect(wbs?.source).toMatch(/^https:\/\/qualifications\.pearson\.com\/.*ial/);
  const paper1 = repos.exams.list().find((e) => e.code === "4BS1 01");
  expect(paper1).toMatchObject({
    date: "2027-05-12",
    session: "afternoon",
    durationMinutes: 90,
    groupIds: ["11D"],
  });
  expect(repos.exams.list().find((e) => e.code === "4BS1 02")).toMatchObject({
    date: "2027-05-21",
    durationMinutes: 90,
  });
  if (!paper1) throw new Error("no paper 1");
  repos.exams.remove(paper1.id);
  firstRun(repos);
  expect(repos.exams.list().map((e) => e.code)).toEqual([
    "4BS1 02",
    "WBS14 01",
  ]);
});

test("a planner seeded before exams existed gets them on the next start, once", () => {
  const repos = createRepos(migratedDb());
  // The older "seeded" flag alone does not stop the exams: they have their own marker.
  repos.settings.setFlag("seeded");
  firstRun(repos);
  expect(repos.exams.list()).toHaveLength(3);
  for (const e of repos.exams.list()) repos.exams.remove(e.id);
  firstRun(repos);
  expect(repos.exams.list()).toEqual([]);
});

test("first run seeds the three courses, and a planner seeded before courses existed still gets them, once", () => {
  const repos = createRepos(migratedDb());
  repos.settings.setFlag("seeded"); // seeded by an older version, with no course record
  firstRun(repos);
  expect(repos.courses.list()).toEqual([
    {
      id: "ial-business-u4",
      title: "IAL Business Unit 4",
      board: "IAL",
      revisionWeeks: 2,
    },
    {
      id: "ib-business",
      title: "IB Business Management",
      board: "IB",
      revisionWeeks: 2,
    },
    {
      id: "igcse-business",
      title: "International GCSE Business",
      board: "IGCSE",
      revisionWeeks: 2,
    },
  ]);
  repos.courses.setRevisionWeeks("ib-business", 3);
  firstRun(repos);
  expect(repos.courses.get("ib-business")?.revisionWeeks).toBe(3);
});
