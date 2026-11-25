import type { Provenance, ReviewState } from "@planner/domain";
import type { ExportLesson } from "./model.ts";

/** Synthetic provenance for the tests: invented run, no sources. */
export const aiProvenance = (
  review: ReviewState,
  at = "2026-11-24T09:00:00.000Z",
): Provenance => ({
  origin: "ai",
  ai: {
    runId: "run-1",
    provider: "fake",
    model: "fake",
    skillId: "planner-suggest-lesson-counts",
    at,
    sources: [],
    review,
  },
});
export const engineProvenance: Provenance = { origin: "engine", ai: null };

/** The week of 23 November 2026 for 13 1, as the Teams example in the brief has it. */
export const lesson = (over: Partial<ExportLesson>): ExportLesson => ({
  groupId: "13 1",
  date: "2026-11-23",
  period: 5,
  room: null,
  title: "2 Supply (3 of 4)",
  state: "planned",
  provenance: engineProvenance,
  ...over,
});
export const WEEK_OF_23_NOV: ExportLesson[] = [
  lesson({ date: "2026-11-23", period: 5, title: "2 Supply (3 of 4)" }),
  lesson({ date: "2026-11-25", period: 2, title: "2 Supply (4 of 4)" }),
  lesson({ date: "2026-11-27", period: 6, title: "Assessment: Chapters 1-2" }),
];
