import type { FlexEdit, PlacementState } from "@planner/domain";

/**
 * The words the board, Today and the proposal dialog use for a plan. Kept
 * here so shared components do not reach into a screen for them.
 */

/** The words for each state, so colour is never the only difference. */
export const STATE_LABEL: Record<PlacementState, string> = {
  planned: "Planned",
  assumed: "Assumed taught",
  taught: "Taught",
  cover: "Cover",
  homework: "Set as homework",
  skipped: "Skipped",
  declared: "Declared",
};

/** The index's explanation of a spare lesson, word for word. */
export const SPARE_EXPLANATION =
  "A lesson this group has before the next checkpoint that the other groups do not. Use it for exam practice, support activities or independent study.";

export const PURPOSE_LABEL: Record<NonNullable<FlexEdit["purpose"]>, string> = {
  "exam-practice": "Exam practice",
  support: "Support activities",
  "independent-study": "Independent study",
  revision: "Revision and exam practice",
};
