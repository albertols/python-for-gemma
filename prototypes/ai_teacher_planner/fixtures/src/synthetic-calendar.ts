import {
  type CalendarRow,
  type IsoDate,
  mondayOf,
  type YearGroup,
} from "@planner/domain";
import ExcelJS from "exceljs";
import { syntheticRows } from "./synthetic-calendar-model.ts";

// Writes the synthetic model into a workbook laid out like the school's
// calendar, noise and all. Nothing here is copied from a real file.

export interface SyntheticWorkbookOptions {
  /** Rename every header cell with this text. */
  renameHeader?: { from: string; to: string };
  /** Insert an empty column so that this 1-based column number is blank. */
  insertBlankColumnAt?: number;
  /** Give the AssRep tab the wrong week for this Monday. */
  assRepMismatchOn?: IsoDate;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "April",
  "May",
  "June",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const YEARS: YearGroup[] = [7, 8, 9, 10, 11, 12, 13];

const parts = (d: IsoDate) => ({
  month: Number(d.slice(5, 7)),
  day: Number(d.slice(8, 10)),
  weekday: (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7, // Monday = 0
});

type Cell = string | number | null;

function headerRow(): string[] {
  const row = [
    "",
    "Month",
    "Date",
    "Day",
    "Week1/2",
    "After school meetings",
    "DATES OF IMPORTANCE",
    "SECONDARY EVENT",
  ];
  for (const y of YEARS)
    row.push(
      "Events",
      "Communication",
      ...(y >= 12
        ? ["Assessments A level", "Assessments IB"]
        : ["Assessments"]),
    );
  row.push("Week1/2", "Day", "Date", "Month");
  return row;
}

/** First column (0-based) of each year's block in the header row. */
function blockStarts(header: string[]): number[] {
  return header.flatMap((h, i) => (h === "Events" ? [i] : []));
}

function dataRow(
  header: string[],
  r: { month: Cell; date: Cell; day: Cell; label: Cell; event?: Cell },
  row?: CalendarRow,
): Cell[] {
  const cells: Cell[] = header.map(() => null);
  cells[1] = r.month;
  cells[2] = r.date;
  cells[3] = r.day;
  cells[4] = r.label;
  cells[7] = r.event ?? null;
  if (row) {
    const starts = blockStarts(header);
    YEARS.forEach((y, i) => {
      const c = row.byYear[y];
      const at = starts[i];
      if (!c || at === undefined) return;
      cells[at] = c.events;
      cells[at + 1] = c.communication;
      cells[at + 2] = c.assessments ?? c.assessmentsALevel;
      if (y >= 12) cells[at + 3] = c.assessmentsIb;
    });
  }
  return cells;
}

const labelText = (row: CalendarRow): Cell =>
  row.rawLabel === "W1"
    ? "Week 1"
    : row.rawLabel === "W2"
      ? "Week 2"
      : row.rawLabel;

function addCalendarSheet(
  wb: ExcelJS.Workbook,
  options: SyntheticWorkbookOptions,
): void {
  const ws = wb.addWorksheet("Calendar 2026-27");
  const header = headerRow();
  const at = options.insertBlankColumnAt;
  const shift = (i: number) => (at !== undefined && i + 1 >= at ? i + 1 : i);
  const put = (r: number, cells: Cell[]) =>
    cells.forEach((v, i) => {
      if (v !== null && v !== "") ws.getCell(r, shift(i) + 1).value = v;
    });

  // Row 1: title in column C, each year name above the middle of its block.
  const titleRow: Cell[] = header.map(() => null);
  titleRow[2] = "Calendar 2026/27";
  blockStarts(header).forEach((s, i) => {
    titleRow[s + 1] = `Year ${YEARS[i]}`;
  });
  put(1, titleRow);

  const rename = options.renameHeader;
  put(
    2,
    header.map((h) => (rename && h === rename.from ? rename.to : h)),
  );

  let r = 3;
  // July noise: a wrong weekday, gaps, a missing weekday and a stray weekday.
  for (const [d, day] of [
    [5, "Su"],
    [6, "Mo"],
    [7, "Tu"],
    [8, "We"],
    [9, "Th"],
    [10, "Fr"],
    [11, "Mo"],
    [14, "Tu"],
    [29, null],
  ] as const)
    put(r++, dataRow(header, { month: "Jul", date: d, day, label: null }));
  put(
    r++,
    dataRow(header, { month: null, date: null, day: "Fr", label: null }),
  );

  let mergeFrom: number | null = null;
  let mergeTo = 0;
  for (const row of syntheticRows()) {
    const p = parts(row.date);
    put(
      r,
      dataRow(
        header,
        {
          month: MONTHS[p.month - 1] ?? "",
          date: p.day,
          day: DAYS[p.weekday] ?? "",
          label: labelText(row),
          event:
            row.date >= "2027-02-15" && row.date <= "2027-02-19"
              ? null
              : row.secondaryEvent,
        },
        row,
      ),
    );
    if (row.date === "2027-02-15") {
      mergeFrom = r;
      ws.getCell(r, shift(7) + 1).value = row.secondaryEvent;
    }
    if (row.date === "2027-02-19") mergeTo = r;
    r++;
  }
  if (mergeFrom !== null) {
    const col = shift(7) + 1;
    ws.mergeCells(mergeFrom, col, mergeTo, col);
  }
}

function addAssRepSheet(wb: ExcelJS.Workbook, wrongOn: IsoDate | undefined) {
  const ws = wb.addWorksheet("AssRep 26_27");
  ws.addRow(["Month", "Day", "Date", "Week", "Holidays"]);
  const rows = syntheticRows();
  const weekOf = new Map<IsoDate, CalendarRow[]>();
  for (const row of rows)
    weekOf.set(mondayOf(row.date), [
      ...(weekOf.get(mondayOf(row.date)) ?? []),
      row,
    ]);
  for (const [monday, days] of [...weekOf].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    const label = days.find((d) => d.weekLabel !== null)?.weekLabel ?? null;
    const holiday = days.some((d) => d.secondaryEvent === "School Holiday");
    if (label === null && !holiday) continue;
    const flipped = monday === wrongOn;
    const base = label === "W1" ? 1 : 2;
    const week = label === null ? null : flipped ? 3 - base : base;
    const p = parts(monday);
    ws.addRow([
      FULL_MONTHS[p.month - 1],
      "Mon",
      p.day,
      week,
      label === null ? "Half term" : null,
    ]);
  }
}

function addReportSheets(wb: ExcelJS.Workbook): void {
  const reports = wb.addWorksheet("Report deadlines");
  reports.addRow([
    "Year / programme",
    "Report",
    "SIMS columns",
    "Data deadline",
    "HoD review",
    "Sent home",
    "Explanation",
  ]);
  reports.addRow([]);
  reports.addRow([
    "Year 7",
    "Report 1: Short",
    "Effort, Attainment",
    "Wednesday 10th March 2027",
  ]);
  reports.addRow([]);
  reports.addRow([
    "Year 11 ",
    "Report 2: Long",
    "Grade, Effort, Comment",
    "Monday 30th November 2026",
    "Friday 4th December 2026",
    "Thursday 11th December 2026",
    "Comments in full",
  ]);
  reports.addRow([]);
  reports.addRow([
    "Year 12",
    "Report 3",
    "Grade, Effort",
    "Wednesday 10th March 2027",
  ]);
  reports.addRow(["IB"]);
  reports.addRow([]);
  reports.addRow([
    "Year 12",
    "Report 3",
    "Grade, Effort",
    "Wednesday 10th March 2027",
  ]);
  reports.addRow(["A level"]);

  const eves = wb.addWorksheet("Parents eves");
  eves.addRow(["", "Term 1", "Term 2", "Term 3"]);
  eves.addRow(["Year 11", "Parent Meeting: Oct 29"]);
  eves.addRow(["Year 13", "Parent Meeting: Nov 26"]);
}

export async function buildSyntheticWorkbook(
  options: SyntheticWorkbookOptions = {},
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Staff list").addRow(["Name", "Role"]);
  addCalendarSheet(wb, options);
  addAssRepSheet(wb, options.assRepMismatchOn);
  addReportSheets(wb);
  wb.addWorksheet("Calendar notes").addRow(["Not the calendar"]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
