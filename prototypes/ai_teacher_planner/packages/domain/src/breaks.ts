import type { CalendarDay } from "./calendar.ts";
import { addDays, type IsoDate, weekdayOf } from "./dates.ts";

/** Weekdays (Monday to Friday) strictly between two dates. */
function weekdaysBetween(from: IsoDate, to: IsoDate): number {
  let n = 0;
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1))
    if (weekdayOf(d) <= 5) n += 1;
  return n;
}

/**
 * Each pupil day that is followed by at least `minWeekdays` weekdays in a row
 * without a pupil day, in date order. The last pupil day of the calendar
 * counts too: it is the last day before the summer gap. Weekends do not count
 * towards the gap, so one holiday on a Monday is not a break.
 */
export function lastDaysBeforeBreaks(
  days: readonly CalendarDay[],
  minWeekdays = 5,
): IsoDate[] {
  const pupil = days
    .filter((d) => d.pupilDay)
    .map((d) => d.date)
    .sort();
  const found: IsoDate[] = [];
  pupil.forEach((date, i) => {
    const next = pupil[i + 1];
    if (next === undefined || weekdaysBetween(date, next) >= minWeekdays)
      found.push(date);
  });
  return found;
}
