import {
  buildSyntheticPlanningSheet,
  type SheetCell,
  SYNTHETIC_PLANNING_ROWS,
} from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import {
  type PlanningImport,
  type PlanningRow,
  readPlanningSheet,
} from "./read-planning.ts";

const imp = await readPlanningSheet(await buildSyntheticPlanningSheet());
const row = (n: string): PlanningRow | undefined =>
  imp.rows.find((r) => r.number === n);
const withRows = (change: (rows: SheetCell[][]) => SheetCell[][]) =>
  buildSyntheticPlanningSheet(
    change(SYNTHETIC_PLANNING_ROWS.map((r) => [...r])),
  );
const kinds = (i: PlanningImport) => i.findings.map((f) => f.kind);

describe("the planning sheet", () => {
  test("sections and chapters are told apart, and a chapter's number is split from its title", () =>
    expect(imp.rows.map((r) => [r.kind, r.number, r.title])).toEqual([
      ["section", null, "Part A"],
      ["chapter", "1", "Demand"],
      ["chapter", "2", "Supply"],
      ["section", null, "Part B"],
      ["chapter", "3", "Markets"],
      ["chapter", "4", "Prices"],
    ]));

  test("a section keeps the total in its title, and its sheet row", () => {
    expect(imp.rows[0]).toMatchObject({
      sheetRow: 2,
      statedSectionTotal: 7,
      lessons: null,
    });
    expect(row("4")).toMatchObject({ sheetRow: 7, statedSectionTotal: null });
  });

  test("a count with a note keeps both", () => {
    expect(row("1")).toMatchObject({
      lessons: 3,
      countNote: "started last year",
    });
    expect(row("2")).toMatchObject({ lessons: 4, countNote: null });
  });

  test("the stated total and the sum are both kept, and a difference is a finding", () => {
    expect(imp).toMatchObject({ statedTotal: 10, sum: 13 });
    expect(imp.findings).toContainEqual(
      expect.objectContaining({
        kind: "total-mismatch",
        severity: "warning",
        message: expect.stringContaining("10"),
      }),
    );
    expect(imp.findings).toHaveLength(1);
  });

  test("a stated total that agrees is no finding", async () => {
    const agree = await readPlanningSheet(
      await withRows((rows) => rows.map((r) => (r[1] === 10 ? [null, 13] : r))),
    );
    expect(agree).toMatchObject({ statedTotal: 13, sum: 13, findings: [] });
  });

  test("a section total that disagrees with its chapters is a finding", async () => {
    const off = await readPlanningSheet(
      await withRows((rows) =>
        rows.map((r) =>
          r[0] === "Part B (6 classes)" ? ["Part B (7 classes)", null] : r,
        ),
      ),
    );
    const found = off.findings.filter(
      (f) => f.kind === "section-total-mismatch",
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "warning", sheetRow: 5 });
    expect(found[0]?.message).toContain("7");
    expect(found[0]?.message).toContain("6");
  });

  test("a chapter with no number in its count cell is a finding and gets no count", async () => {
    const odd = await readPlanningSheet(
      await withRows((rows) =>
        rows.map((r) => (r[0] === "2 Supply" ? ["2 Supply", "TBC"] : r)),
      ),
    );
    expect(odd.rows.find((r) => r.number === "2")).toMatchObject({
      kind: "chapter",
      lessons: null,
    });
    expect(odd.sum).toBe(9);
    expect(odd.findings).toContainEqual(
      expect.objectContaining({ kind: "missing-count", sheetRow: 4 }),
    );
  });

  test("a count that is not a whole number is a finding and gives no lessons", async () => {
    for (const odd of ["4.5", "3-4", 4.5]) {
      const rows: SheetCell[][] = SYNTHETIC_PLANNING_ROWS.map((r) =>
        r[0] === "2 Supply" ? ["2 Supply", odd] : r,
      );
      const read = await readPlanningSheet(
        await buildSyntheticPlanningSheet(rows),
      );
      expect(
        read.rows.find((r) => r.number === "2")?.lessons,
        String(odd),
      ).toBeNull();
      expect(
        read.findings.filter((f) => f.kind === "missing-count"),
        String(odd),
      ).toEqual([
        expect.objectContaining({
          sheetRow: 4,
          message: expect.stringContaining("not a whole number"),
        }),
      ]);
    }
  });

  test("a third column is kept as the chapter's exam-practice note", async () => {
    const noted = await readPlanningSheet(
      await withRows((rows) =>
        rows.map((r) =>
          r[0] === "3 Markets" ? ["3 Markets", 4, "Past paper Q2"] : r,
        ),
      ),
    );
    expect(noted.rows.find((r) => r.number === "3")?.extra).toBe(
      "Past paper Q2",
    );
  });

  test("a sheet without a 'Number of Classes' header is refused", async () => {
    const refused = await readPlanningSheet(
      await buildSyntheticPlanningSheet(SYNTHETIC_PLANNING_ROWS, [
        "Synthetic Content",
        "Lessons",
      ]),
    );
    expect(refused.rows).toEqual([]);
    expect(refused.findings).toEqual([
      expect.objectContaining({ kind: "missing-header", severity: "error" }),
    ]);
    expect(kinds(refused)).toEqual(["missing-header"]);
  });

  test("a file that is not a workbook is refused, not thrown", async () => {
    const refused = await readPlanningSheet(new Uint8Array([1, 2, 3]));
    expect(refused.rows).toEqual([]);
    expect(kinds(refused)).toEqual(["unreadable-table"]);
  });
});
