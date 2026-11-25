import {
  addDays,
  type IsoDate,
  type Period,
  type PlacementState,
  weekdayOf,
} from "@planner/domain";
import ExcelJS from "exceljs";
import { reviewedOnly } from "../ai-note.ts";
import { inWeekOf, shortDay } from "../dates.ts";
import type { ExportLesson, FortnightExport } from "../model.ts";

const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];
const STATE_LABEL: Partial<Record<PlacementState, string>> = {
  taught: "Taught",
  cover: "Cover",
  homework: "Homework",
  skipped: "Skipped",
  assumed: "Assumed, not confirmed",
  declared: "Taught earlier",
};

/**
 * Writes text into a cell as a string in a text-format cell, whatever it starts
 * with. A title that begins with `=`, `+`, `-`, `@`, a tab or a carriage return
 * must never become a formula, so no cell in these workbooks is set any other way.
 */
export function textCell(cell: ExcelJS.Cell, text: string): void {
  cell.value = text;
  cell.numFmt = "@";
  cell.alignment = { wrapText: true, vertical: "top" };
}

const unique = (xs: string[]) => [...new Set(xs)];

/** The group, the titles, the rooms, then the states that are worth saying. */
function cellText(lessons: readonly ExportLesson[]): string {
  return [
    unique(lessons.map((l) => l.groupId)).join(", "),
    ...lessons.map((l) => l.title),
    ...unique(lessons.flatMap((l) => (l.room ? [`Room ${l.room}`] : []))),
    ...unique(lessons.flatMap((l) => STATE_LABEL[l.state] ?? [])),
  ].join("\n");
}

function writeWeek(
  wb: ExcelJS.Workbook,
  name: string,
  monday: IsoDate,
  lessons: readonly ExportLesson[],
  statement: string | null,
): void {
  const ws = wb.addWorksheet(name);
  ws.columns = [{ width: 6 }, ...[1, 2, 3, 4, 5].map(() => ({ width: 26 }))];
  const header = ws.getRow(1);
  textCell(header.getCell(1), "");
  for (let d = 0; d < 5; d++)
    textCell(header.getCell(d + 2), shortDay(addDays(monday, d)));
  header.font = { bold: true };
  PERIODS.forEach((p) => {
    textCell(ws.getCell(p + 1, 1), `P${p}`);
    ws.getCell(p + 1, 1).font = { bold: true };
    ws.getRow(p + 1).height = 62;
  });

  // Her timetable has a cell for each day and period; a lesson fills its own.
  const at = (day: number, period: Period) =>
    lessons.filter(
      (l) =>
        l.period === period &&
        weekdayOf(l.date) === day + 1 &&
        inWeekOf(monday, l.date),
    );
  for (let day = 0; day < 5; day++) {
    for (let i = 0; i < PERIODS.length; i++) {
      const period = PERIODS[i] as Period;
      const here = at(day, period);
      if (here.length === 0) continue;
      // The second half of a double was written with the first.
      const before = PERIODS[i - 1];
      if (
        before !== undefined &&
        isDouble(at(day, before), before, here, period)
      )
        continue;
      const next = PERIODS[i + 1];
      const after = next === undefined ? [] : at(day, next);
      const double = next !== undefined && isDouble(here, period, after, next);
      const col = day + 2;
      const row = period + 1;
      textCell(
        ws.getCell(row, col),
        cellText(double ? [...here, ...after] : here),
      );
      if (double) ws.mergeCells(row, col, row + 1, col);
    }
  }
  for (const row of PERIODS.map((p) => ws.getRow(p + 1)))
    for (let c = 1; c <= 6; c++)
      row.getCell(c).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
  for (let c = 1; c <= 6; c++)
    header.getCell(c).border = { bottom: { style: "medium" } };

  if (statement) {
    ws.mergeCells(9, 1, 9, 6);
    textCell(ws.getCell(9, 1), statement);
    ws.getCell(9, 1).font = { italic: true };
  }
}

/**
 * Two periods are one double only when the timetable says so (each lesson names
 * the other as its `doubleWith`) and both have a lesson of the same one group.
 * Being next to each other is not enough.
 */
function isDouble(
  first: readonly ExportLesson[],
  firstPeriod: Period,
  second: readonly ExportLesson[],
  secondPeriod: Period,
): boolean {
  if (first.length === 0 || second.length === 0) return false;
  const groups = unique([...first, ...second].map((l) => l.groupId));
  return (
    groups.length === 1 &&
    first.some((l) => l.doubleWith === secondPeriod) &&
    second.some((l) => l.doubleWith === firstPeriod)
  );
}

/**
 * The fortnight as a workbook in the shape of her timetable: a sheet for Week 1
 * and one for Week 2, Monday to Friday across and periods 1 to 6 down. A double
 * period is one merged cell. A lesson AI drafted that she has not accepted is
 * left out (with anything in `heldBack`) and counted in the warning, which is
 * also saved in the workbook's description. Her reviewed AI items are named in a
 * statement on the last row.
 */
export async function exportFortnightXlsx(
  data: FortnightExport,
): Promise<{ file: Uint8Array; warning: string | null }> {
  if (data.w1 === null && data.w2 === null)
    throw new Error("A fortnight needs at least one week.");
  const { included, statement, warning } = reviewedOnly(
    data.lessons,
    data.heldBack,
  );
  const wb = new ExcelJS.Workbook();
  wb.creator = "AI Teacher Planner";
  wb.created = new Date(`${data.generatedOn}T00:00:00Z`);
  wb.modified = wb.created;
  if (warning) wb.description = warning;
  if (data.w1) writeWeek(wb, "Week 1", data.w1, included, statement);
  if (data.w2) writeWeek(wb, "Week 2", data.w2, included, statement);
  const buffer = await wb.xlsx.writeBuffer();
  return { file: new Uint8Array(buffer), warning };
}
