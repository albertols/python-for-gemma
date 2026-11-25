import {
  type Course,
  type CourseId,
  type Group,
  type IsoDate,
  type PlanInputs,
  teachingBlocks,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { loadPlanning } from "./planning.ts";

/** The course, or a 404 she can read. */
export function courseOrThrow(repos: Repos, courseId: CourseId): Course {
  const course = repos.courses.get(courseId);
  if (!course) throw new ApiError(404, "not-found", "There is no such course.");
  return course;
}

/** The course's groups, by id. */
export function groupsOf(repos: Repos, courseId: CourseId): Group[] {
  return repos.timetable
    .groups()
    .filter((g) => g.courseId === courseId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Plans are made from a locked pack: until then the scheme cannot be saved, so there is nothing to plan. */
export function requireLockedPack(packs: PackStore, courseId: CourseId): void {
  if (packs.locked(courseId) === null)
    throw new ApiError(
      409,
      "pack-not-locked",
      "Lock the course's curriculum pack first. The scheme of work is built on it.",
    );
}

/**
 * Everything the engine needs to plan one course today, from the database.
 * Days, groups and slots come from `loadPlanning`, so her cancellations and the
 * events she confirmed are already in the slots; this adds the teaching blocks,
 * the scheme, her decisions and facts, the official exams of the course's groups,
 * the course's revision weeks and the head of its plan. It never builds slots.
 */
export function loadPlanInputs(
  repos: Repos,
  packs: PackStore,
  courseId: CourseId,
  today: IsoDate,
): PlanInputs {
  const course = courseOrThrow(repos, courseId);
  requireLockedPack(packs, courseId);
  const planning = loadPlanning(repos);
  const groups = planning.groups.filter((g) => g.courseId === courseId);
  const ids = new Set(groups.map((g) => g.id));
  const decisions = repos.decisions.forCourse(courseId);
  return {
    courseId,
    today,
    groups,
    slots: planning.slots.filter((s) => ids.has(s.groupId)),
    blocks: teachingBlocks(planning.days, planning.terms),
    items: repos.scheme.items(courseId),
    overrides: repos.scheme.overrides(courseId),
    positions: repos.facts.positions(courseId),
    log: repos.facts.log([...ids]),
    pins: decisions.pins,
    merges: decisions.merges,
    coverChoices: decisions.coverChoices,
    homework: decisions.homework,
    holds: decisions.holds,
    flexEdits: decisions.flexEdits,
    previous: repos.plans.head(courseId)?.snapshot ?? null,
    exams: repos.exams.list().filter((e) => e.groupIds.some((g) => ids.has(g))),
    revisionWeeks: course.revisionWeeks,
  };
}
