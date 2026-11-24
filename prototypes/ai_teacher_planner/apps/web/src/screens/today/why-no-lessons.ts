import type { TodayData } from "../../api/queries.ts";

/** Why a day has no lessons to teach, in the calendar's own words where it has them. */
export function whyNoLessons(
  day: {
    kind: TodayData["kind"];
    lessons: readonly { slot: { status: string } }[];
  },
  calendarText: string | null,
): string {
  switch (day.kind) {
    case "weekend":
      return "It's the weekend.";
    case "outside-term":
      return calendarText ?? "It's outside term time.";
    case "unlabelled":
      return calendarText ?? "There is no school today.";
    default:
      return day.lessons.length > 0 &&
        day.lessons.every((l) => l.slot.status === "cancelled")
        ? "Every lesson today is cancelled."
        : "You have no lessons today.";
  }
}
