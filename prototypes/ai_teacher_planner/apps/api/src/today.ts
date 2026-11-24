import type { IsoDate } from "@planner/domain";

/** The calendar date in `timeZone` at the instant `now`. */
export function localIsoDate(now: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
