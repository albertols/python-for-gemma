import type {
  Course,
  ExamInput,
  Group,
  Term,
  TimetableVersion,
} from "@planner/domain";
import coursesJson from "../courses.2026-27.json" with { type: "json" };
import examsJson from "../external-exams.2026-27.json" with { type: "json" };
import groupsJson from "../groups.2026-27.json" with { type: "json" };
import termsJson from "../terms.2026-27.json" with { type: "json" };
import timetableJson from "../timetable.2026-27.json" with { type: "json" };

/** Gemma's two-week timetable from 31 Aug 2026 (spec appendix A). Lessons and study-hall duties only. */
export const SEED_TIMETABLE: TimetableVersion =
  timetableJson as TimetableVersion;

/** Her six groups, with a colour token name that Task 1.9 gives a value. */
export const SEED_GROUPS: Group[] = groupsJson as Group[];

/** The three terms of 2026-27: first and last pupil day. */
export const SEED_TERMS: Term[] = termsJson as Term[];

/** Her official exams from Pearson's final summer 2027 timetables (spec appendix E). */
export const SEED_EXAMS: ExamInput[] = examsJson as ExamInput[];

/** Her three courses: the exam board and how many revision weeks each plan keeps (2 to start). */
export const SEED_COURSES: Course[] = coursesJson as Course[];
