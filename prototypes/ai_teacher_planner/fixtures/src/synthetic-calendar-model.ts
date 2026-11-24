import {
  type CalendarRow,
  eachDay,
  mondayOf,
  type Term,
  weekdayOf,
  type YearCells,
  type YearGroup,
} from "@planner/domain";

// A school year built by rule, not copied from any real file.

export const SYNTHETIC_TERMS: Term[] = [
  { id: "T1", firstPupilDay: "2026-09-04", lastPupilDay: "2026-12-22" },
  { id: "T2", firstPupilDay: "2027-01-08", lastPupilDay: "2027-03-19" },
  { id: "T3", firstPupilDay: "2027-04-05", lastPupilDay: "2027-06-29" },
];

const FIRST_DAY = "2026-08-01";
const LAST_DAY = "2027-06-30";
const FIRST_LABELLED = "2026-08-31";
const LAST_LABELLED = "2027-06-29";

const HOLIDAYS: [string, string, string][] = [
  ["2026-11-02", "2026-11-06", "School Holiday"],
  ["2026-12-23", "2027-01-07", "School Holiday"],
  ["2027-02-15", "2027-02-19", "School Holiday"],
  ["2027-03-22", "2027-04-02", "School Holiday"],
  ["2026-10-12", "2026-10-12", "Official Holiday"],
  ["2027-05-17", "2027-05-17", "Official Holiday"],
];

const OTHER_EVENTS: [string, string, string][] = [
  ["2026-08-31", "2026-08-31", "New staff induction"],
  ["2026-09-01", "2026-09-03", "Staff training"],
  ["2026-09-04", "2026-09-04", "First day of term for students"],
  ["2027-05-04", "2027-05-04", "Staff training day"],
  ["2027-06-29", "2027-06-29", "Staff only"],
];

function eventOn(
  table: [string, string, string][],
  date: string,
): string | null {
  const hit = table.find(([from, to]) => date >= from && date <= to);
  return hit ? hit[2] : null;
}

const cells = (events: string): YearCells => ({
  events,
  communication: null,
  assessments: null,
  assessmentsALevel: null,
  assessmentsIb: null,
});

function byYearOn(date: string): CalendarRow["byYear"] {
  const out: Partial<Record<YearGroup, YearCells>> = {};
  if (date >= "2027-01-11" && date <= "2027-01-15") {
    out[11] = cells("Mock exams");
    out[13] = cells("Mock exams");
  }
  if (date === "2026-12-02") out[12] = cells("Geography trip");
  return out;
}

export function syntheticRows(): CalendarRow[] {
  const dates = eachDay(FIRST_DAY, LAST_DAY);
  const isLabelled = (d: string) =>
    weekdayOf(d) <= 5 &&
    d >= FIRST_LABELLED &&
    d <= LAST_LABELLED &&
    eventOn(HOLIDAYS, d) === null;

  // Weeks alternate from W1, counting only weeks that contain a labelled day.
  const labelOfWeek = new Map<string, "W1" | "W2">();
  for (const d of dates) {
    const monday = mondayOf(d);
    if (isLabelled(d) && !labelOfWeek.has(monday))
      labelOfWeek.set(monday, labelOfWeek.size % 2 === 0 ? "W1" : "W2");
  }

  return dates.map((date): CalendarRow => {
    const weekLabel = isLabelled(date)
      ? (labelOfWeek.get(mondayOf(date)) ?? null)
      : null;
    return {
      date,
      rawLabel: date === "2026-10-31" ? "x" : weekLabel,
      weekLabel,
      afterSchool: null,
      datesOfImportance: null,
      secondaryEvent: eventOn(HOLIDAYS, date) ?? eventOn(OTHER_EVENTS, date),
      byYear: byYearOn(date),
      hash: `synthetic-${date}`,
    };
  });
}
