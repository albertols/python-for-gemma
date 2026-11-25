import { expect, test } from "vitest";
import {
  type Access,
  accessFor,
  can,
  type Resource,
  type Role,
  TEACHER_PRINCIPAL,
} from "./permissions.ts";

const E = "edit";
const V = "view";
const N = "none";
// Every cell of the table in spec section 13: [role, resource, access].
const CELLS: [Role, Resource, Access][] = [
  ["teacher", "scheme-of-work", E],
  ["student", "scheme-of-work", N],
  ["parent", "scheme-of-work", N],
  ["admin", "scheme-of-work", N],
  ["head-of-department", "scheme-of-work", E],
  ["teacher", "lesson-plans", E],
  ["student", "lesson-plans", N],
  ["parent", "lesson-plans", N],
  ["admin", "lesson-plans", N],
  ["head-of-department", "lesson-plans", V],
  ["teacher", "chapter-powerpoints", E],
  ["student", "chapter-powerpoints", N],
  ["parent", "chapter-powerpoints", N],
  ["admin", "chapter-powerpoints", N],
  ["head-of-department", "chapter-powerpoints", N],
  ["teacher", "independent-tasks", E],
  ["student", "independent-tasks", V],
  ["parent", "independent-tasks", N],
  ["admin", "independent-tasks", N],
  ["head-of-department", "independent-tasks", N],
  ["teacher", "assessment-calendar", E],
  ["student", "assessment-calendar", N],
  ["parent", "assessment-calendar", N],
  ["admin", "assessment-calendar", N],
  ["head-of-department", "assessment-calendar", E],
  ["teacher", "report-calendar", E],
  ["student", "report-calendar", N],
  ["parent", "report-calendar", N],
  ["admin", "report-calendar", N],
  ["head-of-department", "report-calendar", V],
  ["teacher", "exam-practice-questions", E],
  ["student", "exam-practice-questions", N],
  ["parent", "exam-practice-questions", N],
  ["admin", "exam-practice-questions", N],
  ["head-of-department", "exam-practice-questions", N],
  ["teacher", "mark-schemes", E],
  ["student", "mark-schemes", N],
  ["parent", "mark-schemes", N],
  ["admin", "mark-schemes", N],
  ["head-of-department", "mark-schemes", N],
  ["teacher", "parity-and-coverage", E],
  ["student", "parity-and-coverage", N],
  ["parent", "parity-and-coverage", N],
  ["admin", "parity-and-coverage", N],
  ["head-of-department", "parity-and-coverage", N],
  ["teacher", "cover-lessons", E],
  ["student", "cover-lessons", N],
  ["parent", "cover-lessons", N],
  ["admin", "cover-lessons", N],
  ["head-of-department", "cover-lessons", N],
  ["teacher", "accounts-and-roles", E],
  ["student", "accounts-and-roles", N],
  ["parent", "accounts-and-roles", N],
  ["admin", "accounts-and-roles", E],
  ["head-of-department", "accounts-and-roles", N],
];

test("the table has all 55 cells", () => {
  expect(CELLS).toHaveLength(55);
  expect(new Set(CELLS.map(([r, s]) => `${r}/${s}`)).size).toBe(55);
});

test.each(CELLS)("%s on %s is %s", (role, resource, access) =>
  expect(accessFor(role, resource)).toBe(access),
);

test("a student sees independent tasks for their own group only", () => {
  expect(can("student", "independent-tasks", "view", { ownGroup: true })).toBe(
    true,
  );
  expect(can("student", "independent-tasks", "view", { ownGroup: false })).toBe(
    false,
  );
  expect(can("student", "independent-tasks", "view")).toBe(false);
  expect(can("student", "independent-tasks", "edit", { ownGroup: true })).toBe(
    false,
  );
});

test("a head of department never sees cover lessons", () =>
  expect(can("head-of-department", "cover-lessons", "view")).toBe(false));

test("edit implies view", () => {
  expect(can("teacher", "scheme-of-work", "view")).toBe(true);
  expect(can("admin", "accounts-and-roles", "view")).toBe(true);
});

test("view does not imply edit", () =>
  expect(can("head-of-department", "lesson-plans", "edit")).toBe(false));

test("a parent can do nothing", () => {
  for (const [, resource] of CELLS)
    for (const action of ["view", "edit"] as const)
      expect(can("parent", resource, action, { ownGroup: true })).toBe(false);
});

test("the fixed principal is the teacher", () =>
  expect(TEACHER_PRINCIPAL).toEqual({ role: "teacher" }));
