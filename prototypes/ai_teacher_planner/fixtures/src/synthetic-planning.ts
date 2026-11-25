import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";

// An INVENTED planning sheet and assessment schedule, laid out as the importer
// expects her real ones: a header whose second cell is "Number of Classes",
// sections without counts, chapters that start with their number, a stated
// total near the bottom; and a Word table of dates without a year. Nothing is
// copied from a real file.

export type SheetCell = string | number | null;

/** The rows below the header of the synthetic planning sheet. */
export const SYNTHETIC_PLANNING_ROWS: SheetCell[][] = [
  ["Part A (7 classes)", null],
  ["1 Demand", "3 (started last year)"],
  ["2 Supply", 4],
  ["Part B (6 classes)", null],
  ["3 Markets", 4],
  ["4 Prices", 2],
  [null, null],
  [null, 10],
  ["Total", null],
];

/** The synthetic sheet, or the same layout with `rows` and `header` of your own. */
export async function buildSyntheticPlanningSheet(
  rows: SheetCell[][] = SYNTHETIC_PLANNING_ROWS,
  header: SheetCell[] = ["Synthetic Content", "Number of Classes"],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Planning");
  [header, ...rows].forEach((row, i) => {
    sheet.addRow(row);
    // Her section titles are merged across the first two columns, so both cells read the same.
    if (i > 0 && row[1] === null && /\(\d+ classes\)$/.test(String(row[0])))
      sheet.mergeCells(i + 1, 1, i + 1, 2);
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** The rows below the header of the synthetic assessment schedule. */
export const SYNTHETIC_SCHEDULE_ROWS: string[][] = [
  ["27 Nov", "Chapters 1-2", "20 mark"],
  ["11 Dec", "Chapter 3", "12 mark"],
];

/** The synthetic schedule as a Word file: one table, or the rows and header you give. */
export async function buildSyntheticSchedule(
  rows: string[][] = SYNTHETIC_SCHEDULE_ROWS,
  header: string[] = ["Date", "Topic", "Type"],
): Promise<Uint8Array> {
  const cell = (text: string) =>
    new TableCell({
      width: { size: 3000, type: WidthType.DXA },
      children: [new Paragraph(text)],
    });
  const table = new Table({
    rows: [header, ...rows].map(
      (cells) => new TableRow({ children: cells.map(cell) }),
    ),
  });
  const doc = new Document({
    sections: [
      { children: [new Paragraph("Invented assessment schedule"), table] },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
