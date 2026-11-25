import {
  SEED_COURSES,
  SEED_EXAMS,
  SEED_GROUPS,
  SEED_TERMS,
  SEED_TIMETABLE,
} from "@planner/fixtures/seed";
import type { Repos } from "../repos/ports.ts";

const SEEDED = "seeded";
/** Its own marker: a planner seeded before exams existed still gets them, once. */
const EXAMS_SEEDED = "exams-seeded";
/** Its own marker too: courses arrived in M2, after planners had been seeded. */
const COURSES_SEEDED = "courses-seeded";

/**
 * On an empty database, stores her timetable, groups and terms in one
 * transaction. Safe to call every start: once seeded it never touches them again.
 * The official exams and her courses are seeded the same way, once, each under its own marker.
 */
export function firstRun(repos: Repos): void {
  repos.transaction(() => {
    if (!repos.settings.getFlag(SEEDED)) {
      if (repos.timetable.versions().length === 0)
        repos.timetable.seed([SEED_TIMETABLE], SEED_GROUPS);
      if (repos.settings.terms().length === 0)
        repos.settings.saveTerms(SEED_TERMS);
      repos.settings.setFlag(SEEDED);
    }
    // Keyed by code: one she deleted is never added back, because the marker stays.
    if (!repos.settings.getFlag(EXAMS_SEEDED)) {
      const have = new Set(repos.exams.list().map((e) => e.code));
      for (const exam of SEED_EXAMS)
        if (!have.has(exam.code))
          repos.exams.upsert({ ...exam, id: `x:${crypto.randomUUID()}` });
      repos.settings.setFlag(EXAMS_SEEDED);
    }
    if (!repos.settings.getFlag(COURSES_SEEDED)) {
      repos.courses.seed(SEED_COURSES);
      repos.settings.setFlag(COURSES_SEEDED);
    }
  });
}
