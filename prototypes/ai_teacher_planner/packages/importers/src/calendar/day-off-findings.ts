import {
  type CalendarRow,
  type IsoDate,
  type Term,
  toCalendarDays,
} from "@planner/domain";
import type { ImportFinding } from "./read-calendar.ts";

/** Wording that may mean a labelled day is not a teaching day. Quoted back, never the rest of the cell. */
const UNCERTAIN_PHRASES: readonly { phrase: string; pattern: RegExp }[] = [
  { phrase: "holiday", pattern: /\bholiday/i },
  { phrase: "staff training", pattern: /\bstaff training\b/i },
  { phrase: "staff only", pattern: /\bstaff only\b/i },
  { phrase: "inset", pattern: /\binset\b/i },
  { phrase: "closed to pupils", pattern: /\bclosed to pupils\b/i },
];

const WEEK_NAME = { W1: "Week 1", W2: "Week 2" } as const;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Labelled days in term that are holidays (rule: the engine's own) or that
 * might be days off. Needs the terms, so the import use case calls it.
 */
export function dayOffFindings(
  rows: readonly CalendarRow[],
  terms: readonly Term[],
): ImportFinding[] {
  const rowOf = new Map<IsoDate, CalendarRow>(rows.map((r) => [r.date, r]));
  const findings: ImportFinding[] = [];
  for (const day of toCalendarDays(rows, terms)) {
    if (day.weekLabel === null) continue;
    if (day.kind === "holiday") {
      findings.push({
        kind: "labelled-holiday",
        severity: "info",
        sheetRow: null,
        date: day.date,
        message: `Labelled ${WEEK_NAME[day.weekLabel]} but marked as a holiday: no lessons that day`,
      });
      continue;
    }
    if (day.kind !== "pupil") continue;
    const row = rowOf.get(day.date);
    const cells = [row?.secondaryEvent, row?.datesOfImportance];
    const hit = UNCERTAIN_PHRASES.find((u) =>
      cells.some((c) => c != null && u.pattern.test(c.replace(/\s+/g, " "))),
    );
    if (hit)
      findings.push({
        kind: "possible-day-off",
        severity: "warning",
        sheetRow: null,
        date: day.date,
        message: `Labelled as a teaching day but the calendar says '${hit.phrase}'. Check whether you have lessons`,
      });
  }
  return findings.sort(
    (a, b) => cmp(a.date ?? "", b.date ?? "") || cmp(a.kind, b.kind),
  );
}
