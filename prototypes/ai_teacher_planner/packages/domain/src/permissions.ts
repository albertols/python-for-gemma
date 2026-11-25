export type Role =
  | "teacher"
  | "student"
  | "parent"
  | "admin"
  | "head-of-department";
export type Resource =
  | "scheme-of-work"
  | "lesson-plans"
  | "chapter-powerpoints"
  | "independent-tasks"
  | "assessment-calendar"
  | "report-calendar"
  | "exam-practice-questions"
  | "mark-schemes"
  | "parity-and-coverage"
  | "cover-lessons"
  | "accounts-and-roles";
export type Access = "edit" | "view" | "none";

/** The table in spec section 13, one row per resource, in this role order. */
const ROLE_ORDER = [
  "teacher",
  "student",
  "parent",
  "admin",
  "head-of-department",
] as const satisfies readonly Role[];

const MATRIX: Record<
  Resource,
  readonly [Access, Access, Access, Access, Access]
> = {
  "scheme-of-work": ["edit", "none", "none", "none", "edit"],
  "lesson-plans": ["edit", "none", "none", "none", "view"],
  "chapter-powerpoints": ["edit", "none", "none", "none", "none"],
  // A student's view is limited to their own group: see `can`.
  "independent-tasks": ["edit", "view", "none", "none", "none"],
  "assessment-calendar": ["edit", "none", "none", "none", "edit"],
  "report-calendar": ["edit", "none", "none", "none", "view"],
  "exam-practice-questions": ["edit", "none", "none", "none", "none"],
  "mark-schemes": ["edit", "none", "none", "none", "none"],
  "parity-and-coverage": ["edit", "none", "none", "none", "none"],
  // Head of Department: never before the absence is notified, so none in v1.
  "cover-lessons": ["edit", "none", "none", "none", "none"],
  "accounts-and-roles": ["edit", "none", "none", "edit", "none"],
};

/** Roles whose view is limited to their own group. */
const OWN_GROUP_ONLY: ReadonlySet<string> = new Set([
  "student:independent-tasks",
]);

export function accessFor(role: Role, resource: Resource): Access {
  return MATRIX[resource][ROLE_ORDER.indexOf(role)] ?? "none";
}

/** Edit implies view. A student's view needs `ownGroup: true`. */
export function can(
  role: Role,
  resource: Resource,
  action: "view" | "edit",
  context?: { ownGroup: boolean },
): boolean {
  const access = accessFor(role, resource);
  if (access === "none") return false;
  if (action === "edit" && access !== "edit") return false;
  if (OWN_GROUP_ONLY.has(`${role}:${resource}`) && !context?.ownGroup)
    return false;
  return true;
}

/** v1 has one user, always the teacher. Logins can replace this later. */
export const TEACHER_PRINCIPAL: { role: "teacher" } = { role: "teacher" };
