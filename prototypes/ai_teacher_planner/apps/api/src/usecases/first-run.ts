import { SEED_GROUPS, SEED_TERMS, SEED_TIMETABLE } from "@planner/fixtures";
import type { Repos } from "../repos/ports.ts";

const SEEDED = "seeded";

/**
 * On an empty database, stores her timetable, groups and terms in one
 * transaction. Safe to call every start: once seeded it never touches them again.
 */
export function firstRun(repos: Repos): void {
  repos.transaction(() => {
    if (repos.settings.getFlag(SEEDED)) return;
    if (repos.timetable.versions().length === 0)
      repos.timetable.seed([SEED_TIMETABLE], SEED_GROUPS);
    if (repos.settings.terms().length === 0)
      repos.settings.saveTerms(SEED_TERMS);
    repos.settings.setFlag(SEEDED);
  });
}
