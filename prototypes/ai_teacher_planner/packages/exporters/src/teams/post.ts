import type { GroupId, IsoDate, PlacementState } from "@planner/domain";
import { reviewedOnly } from "../ai-note.ts";
import { dayAndMonth, inWeekOf, shortDay } from "../dates.ts";
import type { ExportLesson, HeldBack } from "../model.ts";

/** What a Teams post says after the title, for the states a class needs to know about. */
const SUFFIX: Partial<Record<PlacementState, string>> = {
  cover: " (cover)",
  skipped: " (not taught)",
  homework: " (homework)",
};

/**
 * Plain text for a Teams post: one line for each of the group's lessons in the
 * week, in date order. No markup, so it pastes the same everywhere. A lesson AI
 * drafted that she has not accepted is left out and counted in the warning.
 */
export function teamsPostText(args: {
  groupId: GroupId;
  weekOf: IsoDate;
  lessons: ExportLesson[];
  heldBack?: readonly HeldBack[];
}): { text: string; warning: string | null } {
  const inScope = args.lessons.filter(
    (l) => l.groupId === args.groupId && inWeekOf(args.weekOf, l.date),
  );
  const { included, statement, warning } = reviewedOnly(inScope, args.heldBack);
  const lines = [...included]
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period)
    .map(
      (l) =>
        `${shortDay(l.date)} P${l.period}: ${l.title}${SUFFIX[l.state] ?? ""}`,
    );
  const text = [
    `${args.groupId}: week of ${dayAndMonth(args.weekOf)}`,
    ...(lines.length > 0 ? lines : ["No lessons this week."]),
    ...(statement ? [statement] : []),
  ].join("\n");
  return { text, warning };
}
