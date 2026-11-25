import mammoth from "mammoth";
import type { ImportFinding } from "../calendar/read-calendar.ts";
import { type LooseDate, parseLooseDate } from "../loose-date.ts";

export interface ScheduleRow {
  dateText: string;
  date: LooseDate;
  topicText: string;
  type: string;
  marks: number | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith("#"))
        return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The cells of the first table in mammoth's HTML, row by row, or null when there is none. */
function firstTable(html: string): string[][] | null {
  const table = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if (table === undefined) return null;
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...(tr[1] ?? "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((td) =>
      decode(td[1] ?? ""),
    ),
  );
}

const unreadable = (message: string) => ({
  rows: [],
  findings: [
    {
      kind: "unreadable-table" as const,
      severity: "error" as const,
      sheetRow: null,
      date: null,
      message,
    },
  ],
});

const columnOf = (header: string[], pattern: RegExp): number =>
  header.findIndex((h) => pattern.test(h));

/**
 * Reads the first table of her assessment schedule (a Word file): one row per
 * assessment, with a date that has no year, the chapters it covers and its
 * type ("20 mark"). Columns are found by their headings. A date that cannot be
 * read stays in the row, with a finding; the date is never guessed.
 */
export async function readAssessmentSchedule(
  data: Uint8Array,
  academicYear: { start: number; end: number },
): Promise<{ rows: ScheduleRow[]; findings: ImportFinding[] }> {
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(data) })).value;
  } catch {
    return unreadable("This file is not a readable Word document.");
  }
  const table = firstTable(html);
  if (table === null || table.length === 0)
    return unreadable("The document has no table.");
  const header = table[0] ?? [];
  const dateAt = columnOf(header, /date/i);
  const topicAt = columnOf(header, /topic|chapter|content|unit/i);
  const typeAt = columnOf(header, /type|assessment|format/i);
  if (dateAt < 0 || topicAt < 0 || typeAt < 0)
    return unreadable(
      "The first table needs a heading each for the date, the topic and the type.",
    );

  const rows: ScheduleRow[] = [];
  const findings: ImportFinding[] = [];
  table.slice(1).forEach((cells, i) => {
    const sheetRow = i + 2;
    const dateText = cells[dateAt] ?? "";
    const topicText = cells[topicAt] ?? "";
    const type = cells[typeAt] ?? "";
    if (dateText === "" && topicText === "" && type === "") return;
    const date = parseLooseDate(dateText, academicYear);
    const bad = date.issues.filter((x) => x !== "no-year");
    if (date.date === null || bad.length > 0)
      findings.push({
        kind: date.date === null ? "unparseable-row" : "weekday-mismatch",
        severity: "warning",
        sheetRow,
        date: date.date,
        message:
          date.date === null
            ? `Row ${sheetRow} of the schedule has a date that cannot be read ("${dateText}"), so the assessment has no date yet.`
            : `Row ${sheetRow} of the schedule names a weekday that does not match ${date.date}.`,
      });
    const marks = /(\d+)\s*marks?\b/i.exec(type)?.[1];
    rows.push({
      dateText,
      date,
      topicText,
      type,
      marks: marks === undefined ? null : Number(marks),
    });
  });
  return { rows, findings };
}
