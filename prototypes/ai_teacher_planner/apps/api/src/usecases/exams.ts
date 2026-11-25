import { type ExamInput, type ExternalExam, examIssues } from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";

/** Refuses an exam that cannot be stored: bad text, an unknown group, or a code another exam already has. */
function check(repos: Repos, id: string | null, input: ExamInput): void {
  const issues = examIssues(input, repos.timetable.groups());
  if (issues.length > 0)
    throw new ApiError(422, "invalid-exam", issues.join(" "), issues);
  if (repos.exams.list().some((e) => e.code === input.code && e.id !== id))
    throw new ApiError(
      409,
      "exam-code-taken",
      `There is already an exam with the code ${input.code}.`,
    );
}

export function createExam(repos: Repos, input: ExamInput): ExternalExam {
  check(repos, null, input);
  const exam = { ...input, id: `x:${crypto.randomUUID()}` };
  repos.exams.upsert(exam);
  return exam;
}

export function updateExam(
  repos: Repos,
  id: string,
  input: ExamInput,
): ExternalExam {
  if (!repos.exams.list().some((e) => e.id === id))
    throw new ApiError(404, "no-such-exam", "There is no such exam.");
  check(repos, id, input);
  const exam = { ...input, id };
  repos.exams.upsert(exam);
  return exam;
}

export function removeExam(repos: Repos, id: string): void {
  if (!repos.exams.remove(id))
    throw new ApiError(404, "no-such-exam", "There is no such exam to remove.");
}
