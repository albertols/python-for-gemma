import type { WeekLabel } from "./calendar.ts";
import { type IsoDate, weekdayOf } from "./dates.ts";

/** Her correction of one day's week label. It wins over the calendar until she removes it. */
export interface LabelCorrection {
  date: IsoDate;
  weekLabel: WeekLabel;
  note: string | null;
}

export type ResolutionDecision = "teaching-day" | "no-lessons";

/** Her answer to a calendar note that might mean a day off. */
export interface FindingResolution {
  date: IsoDate;
  decision: ResolutionDecision;
  reason: string | null;
}

/** The reason stored for a "no lessons" decision she did not explain. */
export const DEFAULT_NO_LESSONS_REASON = "No lessons (your correction)";

/** A label can only be corrected on a weekday that falls inside a term. */
export function canCorrectLabel(
  date: IsoDate,
  terms: readonly { firstPupilDay: IsoDate; lastPupilDay: IsoDate }[],
): boolean {
  return (
    weekdayOf(date) <= 5 &&
    terms.some((t) => date >= t.firstPupilDay && date <= t.lastPupilDay)
  );
}
