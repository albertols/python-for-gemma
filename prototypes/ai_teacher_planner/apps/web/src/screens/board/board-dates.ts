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
