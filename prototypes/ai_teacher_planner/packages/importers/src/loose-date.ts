import { type IsoDate, isIsoDate, weekdayOf } from "@planner/domain";

export type LooseDateIssue =
  | "weekday-mismatch"
  | "year-outside-academic-year"
  | "no-year"
  | "unparseable";
export interface LooseDate {
  date: IsoDate | null;
  issues: LooseDateIssue[];
  raw: string;
}

const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b`;
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?(?!\d)`;
// A day number pairs with a month only across spaces and/or a comma.
const DAY_THEN_MONTH = new RegExp(String.raw`\b${DAY}[\s,]+${MONTH}`, "i");
const MONTH_THEN_DAY = new RegExp(String.raw`\b${MONTH}[\s,]+${DAY}`, "i");
const YEAR = /\b(20\d{2})\b/;
const WEEKDAY =
  /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
const WEEKDAY_NUMBER: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

const monthNumber = (name: string): number =>
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(name.slice(0, 3).toLowerCase()) + 1;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Reads a free-text date: a day number beside a month name, in either order.
 * Other numbers are ignored. Without a year, July to December take the start
 * year and January to June the end year. Odd cases are reported, never fixed.
 */
export function parseLooseDate(
  text: string,
  academicYear: { start: number; end: number },
): LooseDate {
  const unparseable: LooseDate = {
    date: null,
    issues: ["unparseable"],
    raw: text,
  };
  const a = DAY_THEN_MONTH.exec(text);
  const b = MONTH_THEN_DAY.exec(text);
  // The earlier pairing in the text wins.
  const first =
    a && b ? (a.index <= b.index ? "a" : "b") : a ? "a" : b ? "b" : null;
  if (first === null) return unparseable;
  const dayText = first === "a" ? a?.[1] : b?.[2];
  const monthText = first === "a" ? a?.[2] : b?.[1];
  if (dayText === undefined || monthText === undefined) return unparseable;
  const day = Number(dayText);
  const month = monthNumber(monthText);

  const issues: LooseDateIssue[] = [];
  const yearText = YEAR.exec(text)?.[1];
  let year: number;
  if (yearText !== undefined) {
    year = Number(yearText);
    if (year !== academicYear.start && year !== academicYear.end)
      return {
        date: null,
        issues: ["year-outside-academic-year"],
        raw: text,
      };
  } else {
    year = month >= 7 ? academicYear.start : academicYear.end;
    issues.push("no-year");
  }

  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (!isIsoDate(date)) return unparseable;

  const named = WEEKDAY.exec(text)?.[1];
  if (named !== undefined) {
    const want = WEEKDAY_NUMBER[named.slice(0, 3).toLowerCase()];
    if (want !== weekdayOf(date)) issues.push("weekday-mismatch");
  }
  return { date, issues, raw: text };
}
