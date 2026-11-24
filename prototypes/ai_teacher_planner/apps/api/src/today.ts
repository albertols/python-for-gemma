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

/** Today for the app: the fixed date when one is set, otherwise the local date. */
export function todayOf(
  config: { fixedToday: IsoDate | null; timeZone: string },
  now: Date,
): IsoDate {
  return config.fixedToday ?? localIsoDate(now, config.timeZone);
}
