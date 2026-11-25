import ExcelJS from "exceljs";
import type { ImportFinding } from "../calendar/read-calendar.ts";

export interface PlanningRow {
  kind: "section" | "chapter";
  sheetRow: number;
  number: string | null;
  title: string;
  lessons: number | null;
  countNote: string | null;
  extra: string | null;
  statedSectionTotal: number | null;
}
export interface PlanningImport {
  rows: PlanningRow[];
  /** The total the sheet states near its bottom; the sum below is what its chapters add up to. */
  statedTotal: number | null;
  sum: number;
  findings: ImportFinding[];
}

const finding = (
  kind: ImportFinding["kind"],
  severity: ImportFinding["severity"],
  sheetRow: number | null,
  message: string,
): ImportFinding => ({ kind, severity, sheetRow, date: null, message });

const HEADER = /^number of classes$/i;
const CHAPTER_TITLE = /^(\d+)[.):]?\s+(\S.*)$/;
const SECTION_TOTAL = /\(\s*(\d+)\s*(?:classes|lessons)\s*\)\s*$/i;
const LONE_NUMBER = /^\d+$/;
const TOTAL_WORD = /^total\b/i;

/** What a cell shows, as text: formulas by their result, rich text joined, blanks as "". */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v)
      return v.richText
        .map((r) => r.text)
        .join("")
        .trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if ("text" in v) return String(v.text).trim();
  }
  return String(v).trim();
}

/** "5 (started in Y12)" is 5 with a note; "TBC" has no number. */
function readCount(text: string): {
  lessons: number | null;
  note: string | null;
} {
  const m = /^(\d+)\s*(.*)$/.exec(text);
  if (m === null) return { lessons: null, note: null };
  const note = (m[2] ?? "").replace(/^[\s(\-–:,]+|[\s)]+$/g, "");
  return { lessons: Number(m[1]), note: note === "" ? null : note };
}

/**
 * Reads her planning sheet: the first worksheet whose first row has "Number of
 * Classes" as its second cell. A row with a title and no count is a section; a
 * row that starts with a number, or has a count, is a chapter. Both numbers
 * (the stated total and the sum of the chapters) are kept; a difference is a
 * finding, never fixed.
 */
export async function readPlanningSheet(
  data: Uint8Array,
): Promise<PlanningImport> {
  const empty = (f: ImportFinding): PlanningImport => ({
    rows: [],
    statedTotal: null,
    sum: 0,
    findings: [f],
  });
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    return empty(
      finding(
        "unreadable-table",
        "error",
        null,
        "This file is not a readable Excel workbook.",
      ),
    );
  }
  const sheet = workbook.worksheets.find((s) =>
    HEADER.test(cellText(s.getRow(1).getCell(2))),
  );
  if (sheet === undefined)
    return empty(
      finding(
        "missing-header",
        "error",
        1,
        'No sheet has "Number of Classes" as the second cell of its first row.',
      ),
    );

  const rows: PlanningRow[] = [];
  const findings: ImportFinding[] = [];
  let statedTotal: number | null = null;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    // A section title is merged across the columns: the cells beside the first repeat its text.
    const read = (c: number, leader: string) => {
      const cell = row.getCell(c);
      const text = cellText(cell);
      return cell.isMerged && text === leader ? "" : text;
    };
    const lead = cellText(row.getCell(1));
    const cells = [lead, read(2, lead), read(3, lead)];
    const [first = "", second = "", third = ""] = cells;
    // Cells beyond the third could hold only stray notes; the lone-number test must see them.
    const others = Array.from(
      { length: Math.max(0, row.cellCount - 3) },
      (_, i) => read(i + 4, lead),
    );
    const filled = [...cells, ...others].filter((t) => t !== "");
    if (filled.length === 0) continue;
    const only = filled[0];
    if (filled.length === 1 && only !== undefined && LONE_NUMBER.test(only)) {
      statedTotal = Number(only);
      continue;
    }
    if (TOTAL_WORD.test(first) && filled.length <= 2) {
      const stated = /(\d+)\s*$/.exec(first) ?? /^(\d+)/.exec(second);
      if (stated?.[1] !== undefined) statedTotal = Number(stated[1]);
      continue;
    }
    if (first === "") continue;

    const sectionTotal = SECTION_TOTAL.exec(first);
    const numbered = CHAPTER_TITLE.exec(first);
    const count = readCount(second);
    const isChapter = numbered !== null || second !== "";
    if (!isChapter) {
      rows.push({
        kind: "section",
        sheetRow: r,
        number: null,
        title: first.replace(SECTION_TOTAL, "").trim(),
        lessons: null,
        countNote: null,
        extra: third === "" ? null : third,
        statedSectionTotal: sectionTotal ? Number(sectionTotal[1]) : null,
      });
      continue;
    }
    if (count.lessons === null)
      findings.push(
        finding(
          "missing-count",
          "warning",
          r,
          `Row ${r} has no number of classes, so it has no lessons yet.`,
        ),
      );
    rows.push({
      kind: "chapter",
      sheetRow: r,
      number: numbered?.[1] ?? null,
      title: numbered?.[2] ?? first,
      lessons: count.lessons,
      countNote: count.note,
      extra: third === "" ? null : third,
      statedSectionTotal: null,
    });
  }

  const chapters = rows.filter((x) => x.kind === "chapter");
  const sum = chapters.reduce((n, x) => n + (x.lessons ?? 0), 0);
  if (statedTotal !== null && statedTotal !== sum)
    findings.push(
      finding(
        "total-mismatch",
        "warning",
        null,
        `The sheet states a total of ${statedTotal} classes, and its chapters add up to ${sum}.`,
      ),
    );
  let section: PlanningRow | null = null;
  let inSection = 0;
  const closeSection = () => {
    if (
      section !== null &&
      section.statedSectionTotal !== null &&
      section.statedSectionTotal !== inSection
    )
      findings.push(
        finding(
          "section-total-mismatch",
          "warning",
          section.sheetRow,
          `Row ${section.sheetRow} says ${section.statedSectionTotal} classes for "${section.title}", and its chapters add up to ${inSection}.`,
        ),
      );
  };
  for (const x of rows) {
    if (x.kind === "section") {
      closeSection();
      section = x;
      inSection = 0;
    } else inSection += x.lessons ?? 0;
  }
  closeSection();
  findings.sort((a, b) => (a.sheetRow ?? 1e9) - (b.sheetRow ?? 1e9));
  return { rows, statedTotal, sum, findings };
}
