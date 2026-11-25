import { addDays, type IsoDate, weekdayOf } from "@planner/domain";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const month = (d: IsoDate) => MONTHS[Number(d.slice(5, 7)) - 1] ?? "";

/** "Mon 23 Nov" */
export function shortDay(d: IsoDate): string {
  return `${DAYS[weekdayOf(d) - 1]} ${Number(d.slice(8, 10))} ${month(d).slice(0, 3)}`;
}

/** "23 November" */
export function dayAndMonth(d: IsoDate): string {
  return `${Number(d.slice(8, 10))} ${month(d)}`;
}

/** True when `d` is one of the seven days from `monday`. */
export function inWeekOf(monday: IsoDate, d: IsoDate): boolean {
  return d >= monday && d <= addDays(monday, 6);
}
