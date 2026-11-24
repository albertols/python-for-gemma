import {
  addDays,
  type CalendarRow,
  checkLabels,
  type IsoDate,
  isIsoDate,
  mondayOf,
  toCalendarDays,
  type WeekLabel,
  weekdayOf,
  type YearCells,
  type YearGroup,
} from "@planner/domain";
import ExcelJS from "exceljs";
import { sha256Hex } from "../sha256.ts";

export type FindingKind =
  | "missing-header"
  | "missing-sheet"
  | "unknown-label"
  | "label-on-weekend"
  | "weekday-mismatch"
  | "date-gap"
  | "unparseable-row"
  | "merged-cells"
  | "year-block-mismatch"
  | "label-issue"
  | "assrep-mismatch";
export interface ImportFinding {
  kind: FindingKind;
  severity: "error" | "warning" | "info";
  sheetRow: number | null;
  date: IsoDate | null;
  message: string;
}
export interface CalendarImport {
  ok: boolean;
  academicYear: { start: number; end: number } | null;
  rows: CalendarRow[];
  findings: ImportFinding[];
  fileHash: string;
}

const CALENDAR_SHEET = /^Calendar \d{4}-\d{2}$/;
const REQUIRED = ["Month", "Date", "Day", "Week1/2"] as const;
const MONTH_NUMBER: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const DAY_NUMBER: Record<string, number> = {
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
  su: 7,
};

/** Trimmed text of a cell, or null when empty. Never throws on odd cell types. */
function textOf(value: ExcelJS.CellValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean")
    s = String(value);
  else if (value instanceof Date) s = value.toISOString().slice(0, 10);
  else if ("richText" in value) s = value.richText.map((t) => t.text).join("");
  else if ("result" in value) return textOf(value.result as ExcelJS.CellValue);
  else if ("text" in value) s = String(value.text);
  else return null;
  const t = s.trim();
  return t === "" ? null : t;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const compareFindings = (a: ImportFinding, b: ImportFinding) =>
  (a.sheetRow ?? Number.POSITIVE_INFINITY) -
    (b.sheetRow ?? Number.POSITIVE_INFINITY) ||
  cmp(a.kind, b.kind) ||
  cmp(a.date ?? "", b.date ?? "") ||
  cmp(a.message, b.message);

function stop(
  fileHash: string,
  findings: ImportFinding[],
  academicYear: CalendarImport["academicYear"] = null,
): CalendarImport {
  return {
    ok: false,
    academicYear,
    rows: [],
    findings: [...findings].sort(compareFindings),
    fileHash,
  };
}

interface Columns {
  month: number;
  date: number;
  day: number;
  week: number;
  afterSchool: number | null;
  datesOfImportance: number | null;
  secondaryEvent: number | null;
  blocks: { start: number; cols: Partial<Record<keyof YearCells, number>> }[];
}

const BLOCK_HEADERS: Record<string, keyof YearCells> = {
  Events: "events",
  Communication: "communication",
  Assessments: "assessments",
  "Assessments A level": "assessmentsALevel",
  "Assessments IB": "assessmentsIb",
};

/** The row holding the most required headers (at least two), or null. */
function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  let best: { row: number; hits: number } | null = null;
  for (let r = 1; r <= ws.rowCount; r++) {
    const texts = new Set<string>();
    ws.getRow(r).eachCell((c) => {
      const t = textOf(c.value);
      if (t) texts.add(t);
    });
    const hits = REQUIRED.filter((h) => texts.has(h)).length;
    if (hits >= 2 && (best === null || hits > best.hits))
      best = { row: r, hits };
  }
  return best?.row ?? null;
}

function locateColumns(
  headers: Map<number, string>,
  yearNames: YearGroup[],
  findings: ImportFinding[],
  headerRow: number,
): { cols: Columns; years: YearGroup[] } | null {
  const first = (name: string): number | null => {
    for (const [col, text] of [...headers].sort((a, b) => a[0] - b[0]))
      if (text === name) return col;
    return null;
  };
  const ordered = [...headers].sort((a, b) => a[0] - b[0]);
  const blocks: Columns["blocks"] = [];
  for (const [col, text] of ordered) {
    if (text === "Events") blocks.push({ start: col, cols: { events: col } });
    else if (text in BLOCK_HEADERS) {
      const open = blocks[blocks.length - 1];
      const key = BLOCK_HEADERS[text];
      if (open && key && col === 1 + Math.max(...Object.values(open.cols)))
        open.cols[key] = col;
    }
  }
  const month = first("Month");
  const date = first("Date");
  const day = first("Day");
  const week = first("Week1/2");
  if (month === null || date === null || day === null || week === null)
    return null;
  if (blocks.length !== yearNames.length) {
    findings.push({
      kind: "year-block-mismatch",
      severity: "error",
      sheetRow: headerRow,
      date: null,
      message: `Found ${blocks.length} year-group blocks under ${yearNames.length} year names.`,
    });
    return null;
  }
  return {
    cols: {
      month,
      date,
      day,
      week,
      afterSchool: first("After school meetings"),
      datesOfImportance: first("DATES OF IMPORTANCE"),
      secondaryEvent: first("SECONDARY EVENT"),
      blocks,
    },
    years: yearNames,
  };
}

function academicYearOf(
  ws: ExcelJS.Worksheet,
  headerRow: number,
): { start: number; end: number } {
  for (let r = 1; r < headerRow; r++) {
    let found: { start: number; end: number } | null = null;
    ws.getRow(r).eachCell((c) => {
      const m = /Calendar\s+(\d{4})\s*[/-]\s*(\d{2,4})/.exec(
        textOf(c.value) ?? "",
      );
      if (m?.[1] && m[2] && !found) {
        const start = Number(m[1]);
        const tail = Number(m[2]);
        found = {
          start,
          end: tail < 100 ? start - (start % 100) + tail : tail,
        };
      }
    });
    if (found) return found;
  }
  const m = /(\d{4})-(\d{2})/.exec(ws.name);
  const start = Number(m?.[1]);
  return { start, end: start - (start % 100) + Number(m?.[2]) };
}

const monthYear = (month: number, y: { start: number; end: number }) =>
  month >= 7 ? y.start : y.end;

const iso = (y: number, m: number, d: number): IsoDate =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function dateOf(
  month: string | null,
  day: string | null,
  year: { start: number; end: number },
): IsoDate | null {
  const m = month ? MONTH_NUMBER[month.slice(0, 3).toLowerCase()] : undefined;
  const d = day === null ? NaN : Number(day);
  if (m === undefined || !Number.isInteger(d)) return null;
  const date = iso(monthYear(m, year), m, d);
  return isIsoDate(date) ? date : null;
}

async function rowHash(row: Omit<CalendarRow, "hash">): Promise<string> {
  const years = Object.entries(row.byYear).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  const full = await sha256Hex(
    JSON.stringify([
      row.date,
      row.rawLabel,
      row.afterSchool,
      row.datesOfImportance,
      row.secondaryEvent,
      years,
    ]),
  );
  return full.slice(0, 16);
}

function yearCellsOf(
  row: ExcelJS.Row,
  block: Columns["blocks"][number],
): YearCells {
  const read = (c: number | undefined) =>
    c === undefined ? null : textOf(row.getCell(c).value);
  return {
    events: read(block.cols.events),
    communication: read(block.cols.communication),
    assessments: read(block.cols.assessments),
    assessmentsALevel: read(block.cols.assessmentsALevel),
    assessmentsIb: read(block.cols.assessmentsIb),
  };
}

function parseWeekLabel(raw: string | null): {
  label: WeekLabel | null;
  unknown: boolean;
} {
  if (raw === null) return { label: null, unknown: false };
  const norm = raw.replace(/\s+/g, " ").toLowerCase();
  if (norm === "week 1") return { label: "W1", unknown: false };
  if (norm === "week 2") return { label: "W2", unknown: false };
  return { label: null, unknown: true };
}

export async function readCalendarWorkbook(
  data: Uint8Array,
): Promise<CalendarImport> {
  const fileHash = await sha256Hex(data);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    return stop(fileHash, [
      {
        kind: "missing-sheet",
        severity: "error",
        sheetRow: null,
        date: null,
        message: "The file could not be opened as an Excel workbook.",
      },
    ]);
  }

  const ws = wb.worksheets.find((s) => CALENDAR_SHEET.test(s.name));
  if (!ws)
    return stop(fileHash, [
      {
        kind: "missing-sheet",
        severity: "error",
        sheetRow: null,
        date: null,
        message: "No sheet named like 'Calendar 2026-27' was found.",
      },
    ]);

  const headerRow = findHeaderRow(ws);
  if (headerRow === null)
    return stop(
      fileHash,
      REQUIRED.map((h) => ({
        kind: "missing-header" as const,
        severity: "error" as const,
        sheetRow: null,
        date: null,
        message: `The header '${h}' was not found in the calendar sheet.`,
      })),
    );

  const headers = new Map<number, string>();
  ws.getRow(headerRow).eachCell((c, col) => {
    const t = textOf(c.value);
    if (t) headers.set(col, t);
  });
  const missing = REQUIRED.filter((h) => ![...headers.values()].includes(h));
  const year = academicYearOf(ws, headerRow);
  if (missing.length > 0)
    return stop(
      fileHash,
      missing.map((h) => ({
        kind: "missing-header" as const,
        severity: "error" as const,
        sheetRow: headerRow,
        date: null,
        message: `The header '${h}' was not found in the calendar sheet.`,
      })),
      year,
    );

  const yearNames: YearGroup[] = [];
  const above = headerRow > 1 ? ws.getRow(headerRow - 1) : null;
  above?.eachCell((c) => {
    const m = /^Year (\d{1,2})$/.exec(textOf(c.value) ?? "");
    if (m) yearNames.push(Number(m[1]) as YearGroup);
  });

  const findings: ImportFinding[] = [];
  const located = locateColumns(headers, yearNames, findings, headerRow);
  if (!located) return stop(fileHash, findings, year);
  const { cols, years } = located;

  // Merged ranges below the header: slave cells read as the master's value.
  const merges: string[] =
    (ws.model as unknown as { merges?: string[] }).merges ?? [];
  for (const range of merges) {
    const m = /^[A-Z]+(\d+):[A-Z]+(\d+)$/.exec(range);
    const top = Number(m?.[1]);
    if (!m || top <= headerRow) continue;
    findings.push({
      kind: "merged-cells",
      severity: "warning",
      sheetRow: top,
      date: null,
      message: `Cells ${range} are merged; the value is applied to every row it spans.`,
    });
  }

  const parsed: { sheetRow: number; row: Omit<CalendarRow, "hash"> }[] = [];
  let previous: IsoDate | null = null;
  const text = (row: ExcelJS.Row, col: number | null) =>
    col === null ? null : textOf(row.getCell(col).value);

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const monthText = text(row, cols.month);
    const dateText = text(row, cols.date);
    const dayText = text(row, cols.day);
    const rawLabel = text(row, cols.week);
    if (!monthText && !dateText && !dayText && !rawLabel) continue;

    const date = dateOf(monthText, dateText, year);
    if (date === null) {
      findings.push({
        kind: "unparseable-row",
        severity: "warning",
        sheetRow: r,
        date: null,
        message: "This row has no usable month and day, so it was skipped.",
      });
      continue;
    }
    if (previous !== null && date !== addDays(previous, 1))
      findings.push({
        kind: "date-gap",
        severity: "warning",
        sheetRow: r,
        date,
        message: `The dates jump from ${previous} to ${date}.`,
      });
    previous = date;

    const day = dayText
      ? DAY_NUMBER[dayText.slice(0, 2).toLowerCase()]
      : undefined;
    if (dayText && day !== weekdayOf(date))
      findings.push({
        kind: "weekday-mismatch",
        severity: "warning",
        sheetRow: r,
        date,
        message: `The sheet's weekday does not match ${date}; the date is trusted.`,
      });

    const { label, unknown } = parseWeekLabel(rawLabel);
    if (unknown)
      findings.push({
        kind: "unknown-label",
        severity: "warning",
        sheetRow: r,
        date,
        message: `The week label on ${date} is not Week 1 or Week 2, so it was ignored.`,
      });
    if (label !== null && weekdayOf(date) >= 6)
      findings.push({
        kind: "label-on-weekend",
        severity: "warning",
        sheetRow: r,
        date,
        message: `${date} is a weekend day but carries a week label.`,
      });

    const byYear: CalendarRow["byYear"] = {};
    cols.blocks.forEach((block, i) => {
      const y = years[i];
      if (y !== undefined) byYear[y] = yearCellsOf(row, block);
    });
    parsed.push({
      sheetRow: r,
      row: {
        date,
        rawLabel,
        weekLabel: label,
        afterSchool: text(row, cols.afterSchool),
        datesOfImportance: text(row, cols.datesOfImportance),
        secondaryEvent: text(row, cols.secondaryEvent),
        byYear,
      },
    });
  }

  const sorted = [...parsed].sort((a, b) =>
    a.row.date < b.row.date
      ? -1
      : a.row.date > b.row.date
        ? 1
        : a.sheetRow - b.sheetRow,
  );
  const rows: CalendarRow[] = [];
  for (const p of sorted) rows.push({ ...p.row, hash: await rowHash(p.row) });
  const rowOf = new Map(parsed.map((p) => [p.row.date, p.sheetRow]));

  for (const issue of checkLabels(toCalendarDays(rows, [])))
    findings.push({
      kind: "label-issue",
      severity: "warning",
      sheetRow: rowOf.get(issue.weekOf) ?? null,
      date: issue.weekOf,
      message: issue.detail,
    });

  findings.push(...compareAssRep(wb, year, rows));

  // Findings outside the range of labelled days are only worth a mention.
  const labelled = rows.filter((r) => r.weekLabel !== null).map((r) => r.date);
  const firstLabelled = labelled[0];
  const lastLabelled = labelled[labelled.length - 1];
  const graded = findings.map((f) =>
    f.severity === "warning" &&
    f.date !== null &&
    firstLabelled !== undefined &&
    lastLabelled !== undefined &&
    (f.date < firstLabelled || f.date > lastLabelled)
      ? { ...f, severity: "info" as const }
      : f,
  );

  return {
    ok: !graded.some((f) => f.severity === "error"),
    academicYear: year,
    rows,
    findings: graded.sort(compareFindings),
    fileHash,
  };
}

/** The AssRep tab lists a week number per Monday; compare it with the calendar. */
function compareAssRep(
  wb: ExcelJS.Workbook,
  year: { start: number; end: number },
  rows: readonly CalendarRow[],
): ImportFinding[] {
  const ws = wb.worksheets.find((s) => /^AssRep/i.test(s.name));
  if (!ws) return [];
  const labelOfWeek = new Map<IsoDate, WeekLabel>();
  for (const row of rows)
    if (row.weekLabel !== null && weekdayOf(row.date) <= 5)
      labelOfWeek.set(mondayOf(row.date), row.weekLabel);
  const known = new Set(rows.map((r) => r.date));

  let columns: Record<"month" | "date" | "week", number> | null = null;
  const out: ImportFinding[] = [];
  ws.eachRow((row) => {
    const cells = new Map<string, number>();
    row.eachCell((c, col) => {
      const t = textOf(c.value);
      if (t) cells.set(t, col);
    });
    if (columns === null) {
      const month = cells.get("Month");
      const date = cells.get("Date");
      const week = cells.get("Week");
      if (month && date && week) columns = { month, date, week };
      return;
    }
    const date = dateOf(
      textOf(row.getCell(columns.month).value),
      textOf(row.getCell(columns.date).value),
      year,
    );
    if (date === null || !known.has(date)) return;
    const week = textOf(row.getCell(columns.week).value);
    const want = week === "1" ? "W1" : week === "2" ? "W2" : null;
    const have = labelOfWeek.get(mondayOf(date)) ?? null;
    if (want !== have)
      out.push({
        kind: "assrep-mismatch",
        severity: "warning",
        sheetRow: null,
        date,
        message: `The AssRep tab and the calendar disagree about the week of ${date}.`,
      });
  });
  return out;
}
