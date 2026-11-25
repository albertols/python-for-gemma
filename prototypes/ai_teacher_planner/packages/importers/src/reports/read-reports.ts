import type { YearGroup } from "@planner/domain";
import ExcelJS from "exceljs";
import { type LooseDate, parseLooseDate } from "../loose-date.ts";

type AcademicYear = { start: number; end: number };
type Programme = "A level" | "IB";

export interface ImportedReportWindow {
  yearGroup: YearGroup;
  programme: Programme | null;
  name: string;
  columns: string | null;
  dataDeadline: LooseDate;
  hodReview: LooseDate;
  sentHome: LooseDate;
}
export interface ImportedParentsEvening {
  yearGroup: YearGroup | null;
  label: string;
  term: 1 | 2 | 3;
  date: LooseDate;
}

const REPORT_SHEET = "Report deadlines";
const EVENING_SHEET = "Parents eves";
const YEAR_CELL = /^Year (7|8|9|10|11|12|13)$/;

/** Trimmed text of a cell, or null when empty. */
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
  const t = s.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

async function sheetOf(
  data: Uint8Array,
  name: string,
): Promise<ExcelJS.Worksheet | undefined> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  return wb.getWorksheet(name);
}

const rank = (p: Programme | null) =>
  p === null ? 0 : p === "A level" ? 1 : 2;

export async function readReportDeadlines(
  data: Uint8Array,
  academicYear: AcademicYear,
): Promise<ImportedReportWindow[]> {
  const ws = await sheetOf(data, REPORT_SHEET);
  if (!ws) return [];
  const found: { row: number; window: ImportedReportWindow }[] = [];
  let block: YearGroup | null = null;
  let programme: Programme | null = null;
  const pending: { row: number; cells: (string | null)[] }[] = [];

  const flush = () => {
    if (block !== null) {
      for (const p of pending) {
        const [, name, columns, data1, hod, sent] = p.cells;
        if (!name) continue;
        found.push({
          row: p.row,
          window: {
            yearGroup: block,
            programme,
            name,
            columns: columns ?? null,
            dataDeadline: parseLooseDate(data1 ?? "", academicYear),
            hodReview: parseLooseDate(hod ?? "", academicYear),
            sentHome: parseLooseDate(sent ?? "", academicYear),
          },
        });
      }
    }
    block = null;
    programme = null;
    pending.length = 0;
  };

  for (let r = 1; r <= ws.rowCount; r++) {
    const cells = [1, 2, 3, 4, 5, 6].map((c) => textOf(ws.getCell(r, c).value));
    if (cells.every((c) => c === null)) {
      flush();
      continue;
    }
    const first = cells[0] ?? null;
    const year = first === null ? null : YEAR_CELL.exec(first);
    if (year) {
      flush();
      block = Number(year[1]) as YearGroup;
    } else if (first === "A level" || first === "IB") {
      programme = first;
    }
    if (block !== null) pending.push({ row: r, cells });
  }
  flush();

  return found
    .sort(
      (a, b) =>
        a.window.yearGroup - b.window.yearGroup ||
        rank(a.window.programme) - rank(b.window.programme) ||
        a.row - b.row,
    )
    .map((f) => f.window);
}

export async function readParentsEvenings(
  data: Uint8Array,
  academicYear: AcademicYear,
): Promise<ImportedParentsEvening[]> {
  const ws = await sheetOf(data, EVENING_SHEET);
  if (!ws) return [];
  const termColumns = new Map<number, 1 | 2 | 3>();
  const out: { row: number; evening: ImportedParentsEvening }[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const width = Math.max(ws.columnCount, 1);
    const cells = Array.from({ length: width }, (_, i) =>
      textOf(ws.getCell(r, i + 1).value),
    );
    cells.forEach((text, i) => {
      const m = text === null ? null : /^Term ([123])$/.exec(text);
      if (m) termColumns.set(i, Number(m[1]) as 1 | 2 | 3);
    });
    const first = cells[0] ?? null;
    const year = first === null ? null : YEAR_CELL.exec(first);
    if (first !== "Other" && !year) continue;
    const yearGroup = year ? (Number(year[1]) as YearGroup) : null;
    for (const [col, term] of termColumns) {
      const text = cells[col] ?? null;
      if (text === null) continue;
      const colon = text.indexOf(":");
      out.push({
        row: r,
        evening: {
          yearGroup,
          label: (colon >= 0 ? text.slice(0, colon) : text).trim(),
          term,
          date: parseLooseDate(text, academicYear),
        },
      });
    }
  }
  return out
    .sort(
      (a, b) =>
        a.evening.term - b.evening.term ||
        (a.evening.yearGroup ?? 99) - (b.evening.yearGroup ?? 99) ||
        a.row - b.row,
    )
    .map((o) => o.evening);
}
