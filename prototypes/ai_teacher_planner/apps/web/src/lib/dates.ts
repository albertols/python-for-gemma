const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC",
  });

/** "Mon" and "16 Nov", for a column heading. */
export function dayHeading(iso: string): { weekday: string; date: string } {
  return {
    weekday: fmt(iso, { weekday: "short" }),
    date: fmt(iso, { day: "numeric", month: "short" }),
  };
}

/** "Friday 8 January", for a cell's accessible name. */
export const fullDay = (iso: string): string =>
  fmt(iso, { weekday: "long", day: "numeric", month: "long" });
/** "2026-10-31" as "31 October 2026", whatever the computer's time zone. */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Friday 20 November 2026", for a heading. */
export const fullDayWithYear = (iso: string): string =>
  `${fmt(iso, { weekday: "long" })} ${longDate(iso)}`;

/** "12 Oct", for a block's dates. */
export const shortDate = (iso: string): string =>
  fmt(iso, { day: "numeric", month: "short" });

/** "in 10 days", "tomorrow" or "today". */
export function daysLeftInWords(n: number): string {
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
