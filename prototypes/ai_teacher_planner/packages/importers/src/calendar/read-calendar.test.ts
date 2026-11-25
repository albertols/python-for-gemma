import { buildSyntheticWorkbook, syntheticRows } from "@planner/fixtures";
import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { type CalendarImport, readCalendarWorkbook } from "../index.ts";

const imp = await readCalendarWorkbook(await buildSyntheticWorkbook());
const byDate = (i: CalendarImport, date: string) =>
  i.rows.find((r) => r.date === date);
const findings = (kind: string, i: CalendarImport = imp) =>
  i.findings.filter((f) => f.kind === kind);

describe("the synthetic calendar", () => {
  test("reads every model row with the same date and label", () => {
    const want = syntheticRows();
    expect(imp.ok).toBe(true);
    for (const w of want)
      expect(byDate(imp, w.date)).toMatchObject({
        weekLabel: w.weekLabel,
        secondaryEvent: w.secondaryEvent,
      });
  });

  test("reads the academic year from the title", () =>
    expect(imp.academicYear).toEqual({ start: 2026, end: 2027 }));

  test("builds dates from month and day, with the year from the title", () => {
    expect(byDate(imp, "2026-12-22")).toBeDefined();
    expect(byDate(imp, "2027-01-08")).toBeDefined();
  });

  test("returns rows sorted by date and findings sorted by row then kind", () => {
    const dates = imp.rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
    const keys = imp.findings.map(
      (f) => f.sheetRow ?? Number.POSITIVE_INFINITY,
    );
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  test("reads year-group cells into the right year", () => {
    expect(byDate(imp, "2027-01-11")?.byYear[13]?.events).toBe("Mock exams");
    expect(byDate(imp, "2026-12-02")?.byYear[12]?.events).toBe(
      "Geography trip",
    );
    expect(byDate(imp, "2026-12-02")?.byYear[11]?.events).toBeNull();
  });

  test("reports the stray x and does not treat it as a label", () => {
    expect(byDate(imp, "2026-10-31")).toMatchObject({
      rawLabel: "x",
      weekLabel: null,
    });
    // The August one is before the first labelled day, so it is only a mention.
    expect(findings("unknown-label")).toEqual([
      expect.objectContaining({ date: "2026-08-17", severity: "info" }),
      expect.objectContaining({ date: "2026-10-31", severity: "warning" }),
    ]);
  });

  test("reports the wrong weekday and trusts the date", () =>
    expect(findings("weekday-mismatch")).toEqual([
      expect.objectContaining({ date: "2026-07-11" }),
    ]));

  test("reports each break in the run of dates", () => {
    expect(findings("date-gap")).toHaveLength(3);
    expect(findings("unparseable-row")).toHaveLength(1);
  });

  test("reports the merged range and applies its value to each row it spans", () => {
    expect(findings("merged-cells")).toHaveLength(1);
    expect(byDate(imp, "2027-02-17")?.secondaryEvent).toBe("School Holiday");
  });

  test("a renamed header stops the import and names the header", async () => {
    const bad = await readCalendarWorkbook(
      await buildSyntheticWorkbook({
        renameHeader: { from: "Week1/2", to: "Cycle" },
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.rows).toEqual([]);
    expect(
      bad.findings.filter((f) => f.kind === "missing-header"),
    ).toHaveLength(1);
    expect(bad.findings).toContainEqual(
      expect.objectContaining({
        kind: "missing-header",
        severity: "error",
        message: expect.stringContaining("Week1/2"),
      }),
    );
  });

  test("a moved column is still found by its header", async () => {
    const moved = await readCalendarWorkbook(
      await buildSyntheticWorkbook({ insertBlankColumnAt: 3 }),
    );
    expect(moved.ok).toBe(true);
    expect(byDate(moved, "2027-02-22")?.weekLabel).toBe("W1");
  });

  test("a disagreement with the AssRep tab is a warning", async () => {
    const x = await readCalendarWorkbook(
      await buildSyntheticWorkbook({ assRepMismatchOn: "2026-11-09" }),
    );
    expect(x.findings).toContainEqual(
      expect.objectContaining({
        kind: "assrep-mismatch",
        date: "2026-11-09",
        severity: "warning",
      }),
    );
    expect(findings("assrep-mismatch")).toEqual([]);
  });

  test("the same bytes give the same row hashes; a changed cell changes one hash", async () => {
    const bytes = await buildSyntheticWorkbook();
    const a = await readCalendarWorkbook(bytes);
    const b = await readCalendarWorkbook(bytes);
    expect(a.rows.map((r) => r.hash)).toEqual(b.rows.map((r) => r.hash));
    expect(a.fileHash).toBe(b.fileHash);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Calendar 2026-27");
    if (!ws) throw new Error("no calendar sheet");
    let changed = false;
    ws.eachRow((row) => {
      if (row.getCell(2).value === "Nov" && row.getCell(3).value === 10) {
        row.getCell(8).value = "Changed";
        changed = true;
      }
    });
    expect(changed).toBe(true);
    const c = await readCalendarWorkbook(
      new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer),
    );
    const differing = c.rows.filter((r, i) => r.hash !== a.rows[i]?.hash);
    expect(differing.map((r) => r.date)).toEqual(["2026-11-10"]);
    expect(c.fileHash).not.toBe(a.fileHash);
  });

  test("a workbook with no calendar sheet stops with missing-sheet", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Staff list").addRow(["nothing here"]);
    const out = await readCalendarWorkbook(
      new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer),
    );
    expect(out.ok).toBe(false);
    expect(out.rows).toEqual([]);
    expect(out.findings).toEqual([
      expect.objectContaining({ kind: "missing-sheet", severity: "error" }),
    ]);
  });

  test("a file that is not a workbook stops with one error", async () => {
    const out = await readCalendarWorkbook(
      new TextEncoder().encode("not xlsx"),
    );
    expect(out.ok).toBe(false);
    expect(out.rows).toEqual([]);
    expect(out.findings).toEqual([
      expect.objectContaining({ kind: "missing-sheet", severity: "error" }),
    ]);
  });
});
