import type { LabelCorrection } from "./corrections.ts";
import {
  addDays,
  daysBetween,
  type IsoDate,
  mondayOf,
  weekdayOf,
} from "./dates.ts";

export type WeekLabel = "W1" | "W2";
export type YearGroup = 7 | 8 | 9 | 10 | 11 | 12 | 13;
export interface YearCells {
  events: string | null;
  communication: string | null;
  assessments: string | null;
  assessmentsALevel: string | null;
  assessmentsIb: string | null;
}
export interface CalendarRow {
  date: IsoDate;
  rawLabel: string | null;
  weekLabel: WeekLabel | null;
  afterSchool: string | null;
  datesOfImportance: string | null;
  secondaryEvent: string | null;
  byYear: Partial<Record<YearGroup, YearCells>>;
  hash: string;
}
export interface Term {
  id: "T1" | "T2" | "T3";
  firstPupilDay: IsoDate;
  lastPupilDay: IsoDate;
}
export type DayKind =
  | "pupil"
  | "weekend"
  | "outside-term"
  | "unlabelled"
  | "holiday";
export interface CalendarDay {
  date: IsoDate;
  weekLabel: WeekLabel | null;
  /** Whose label this is: the calendar's, or one she corrected. */
  labelSource: "calendar" | "teacher";
  kind: DayKind;
  pupilDay: boolean;
  text: string | null;
}

const inAnyTerm = (date: IsoDate, terms: readonly Term[]) =>
  terms.some((t) => date >= t.firstPupilDay && date <= t.lastPupilDay);

function kindOf(
  row: CalendarRow,
  weekLabel: WeekLabel | null,
  terms: readonly Term[],
): DayKind {
  if (weekdayOf(row.date) >= 6) return "weekend";
  if (!inAnyTerm(row.date, terms)) return "outside-term";
  if (weekLabel === null) return "unlabelled";
  return isHolidayText(row.secondaryEvent) ? "holiday" : "pupil";
}

/** The two phrases that make a labelled day a holiday; nothing else is inferred. */
const HOLIDAY_PHRASE = /\b(?:official|school) holiday\b/i;
function isHolidayText(text: string | null): boolean {
  return text !== null && HOLIDAY_PHRASE.test(text.replace(/\s+/g, " "));
}

const byDate = (a: { date: IsoDate }, b: { date: IsoDate }) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/**
 * One term from the first row to the last. For checks that run on the sheet
 * alone, before the real terms are known: a labelled holiday is then a holiday.
 */
export function termSpanning(rows: readonly CalendarRow[]): Term[] {
  const first = rows[0]?.date;
  const last = rows[rows.length - 1]?.date;
  return first && last
    ? [{ id: "T1", firstPupilDay: first, lastPupilDay: last }]
    : [];
}

/**
 * One day per row. A correction replaces its date's label, but only on a
 * weekday in term; anywhere else it is ignored here (the API never stores one).
 */
export function toCalendarDays(
  rows: readonly CalendarRow[],
  terms: readonly Term[],
  corrections: readonly LabelCorrection[] = [],
): CalendarDay[] {
  const corrected = new Map(corrections.map((c) => [c.date, c.weekLabel]));
  return rows
    .map((row): CalendarDay => {
      const fix =
        weekdayOf(row.date) <= 5 && inAnyTerm(row.date, terms)
          ? corrected.get(row.date)
          : undefined;
      const weekLabel = fix ?? row.weekLabel;
      const kind = kindOf(row, weekLabel, terms);
      return {
        date: row.date,
        weekLabel,
        labelSource: fix === undefined ? "calendar" : "teacher",
        kind,
        pupilDay: kind === "pupil",
        text: row.secondaryEvent ?? row.datesOfImportance ?? null,
      };
    })
    .sort(byDate);
}

export interface LabelIssue {
  kind: "mixed-labels-in-week" | "labels-do-not-alternate";
  weekOf: IsoDate;
  detail: string;
}

/** Labelled pupil days grouped by the Monday of their week. Holidays and other non-teaching days do not count. */
function labelsByWeek(
  days: readonly CalendarDay[],
): Map<IsoDate, Set<WeekLabel>> {
  const weeks = new Map<IsoDate, Set<WeekLabel>>();
  for (const d of [...days].sort(byDate)) {
    if (d.weekLabel === null || !d.pupilDay) continue;
    const monday = mondayOf(d.date);
    const set = weeks.get(monday) ?? new Set<WeekLabel>();
    set.add(d.weekLabel);
    weeks.set(monday, set);
  }
  return weeks;
}

export function checkLabels(days: readonly CalendarDay[]): LabelIssue[] {
  const issues: LabelIssue[] = [];
  let previous: WeekLabel | null = null;
  for (const [weekOf, labels] of labelsByWeek(days)) {
    const [only] = labels;
    if (labels.size > 1 || only === undefined) {
      issues.push({
        kind: "mixed-labels-in-week",
        weekOf,
        detail: `The week of ${weekOf} has both Week 1 and Week 2 days.`,
      });
      previous = null;
      continue;
    }
    if (only === previous) {
      issues.push({
        kind: "labels-do-not-alternate",
        weekOf,
        detail: `The week of ${weekOf} is ${only}, the same as the labelled week before it.`,
      });
    }
    previous = only;
  }
  return issues;
}

export interface TeachingBlock {
  id: string;
  termId: Term["id"];
  from: IsoDate;
  to: IsoDate;
}

/** Mondays of the weeks that contain at least one pupil day, in order. */
function pupilWeeks(days: readonly CalendarDay[]): Map<IsoDate, CalendarDay[]> {
  const weeks = new Map<IsoDate, CalendarDay[]>();
  for (const d of [...days].sort(byDate)) {
    if (!d.pupilDay) continue;
    const monday = mondayOf(d.date);
    weeks.set(monday, [...(weeks.get(monday) ?? []), d]);
  }
  return weeks;
}

export function teachingBlocks(
  days: readonly CalendarDay[],
  terms: readonly Term[],
): TeachingBlock[] {
  const blocks: TeachingBlock[] = [];
  for (const term of [...terms].sort((a, b) =>
    a.firstPupilDay < b.firstPupilDay
      ? -1
      : a.firstPupilDay > b.firstPupilDay
        ? 1
        : 0,
  )) {
    const inTerm = days.filter(
      (d) =>
        d.pupilDay &&
        d.date >= term.firstPupilDay &&
        d.date <= term.lastPupilDay,
    );
    const weeks = [...pupilWeeks(inTerm)];
    let run: CalendarDay[] = [];
    let previousMonday: IsoDate | null = null;
    const flush = () => {
      const first = run[0];
      const last = run[run.length - 1];
      if (first && last) {
        blocks.push({
          id: `${term.id}${String.fromCharCode(97 + blocks.filter((b) => b.termId === term.id).length)}`,
          termId: term.id,
          from: first.date,
          to: last.date,
        });
      }
      run = [];
    };
    for (const [monday, weekDays] of weeks) {
      if (previousMonday !== null && monday !== addDays(previousMonday, 7))
        flush();
      run.push(...weekDays);
      previousMonday = monday;
    }
    flush();
  }
  return blocks;
}

export interface Fortnight {
  w1: IsoDate | null;
  w2: IsoDate | null;
  breakBefore: boolean;
} // Mondays

export function fortnights(days: readonly CalendarDay[]): Fortnight[] {
  const result: Fortnight[] = [];
  let previousMonday: IsoDate | null = null;
  for (const [monday, weekDays] of pupilWeeks(days)) {
    const label = weekDays[0]?.weekLabel;
    const breakBefore =
      previousMonday !== null && daysBetween(previousMonday, monday) > 7;
    previousMonday = monday;
    const open = result[result.length - 1];
    if (label === "W1") {
      result.push({ w1: monday, w2: null, breakBefore });
    } else if (label === "W2") {
      if (open && open.w1 !== null && open.w2 === null) open.w2 = monday;
      else result.push({ w1: null, w2: monday, breakBefore });
    }
  }
  return result;
}
