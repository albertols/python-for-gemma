import { SYNTHETIC_TERMS, syntheticRows } from "@planner/fixtures";
import { expect, test } from "vitest";
import { dayOffFindings } from "./day-off-findings.ts";

const found = dayOffFindings(syntheticRows(), SYNTHETIC_TERMS);

test("a labelled official holiday is reported once, as information", () =>
  expect(found.filter((f) => f.kind === "labelled-holiday")).toEqual([
    {
      kind: "labelled-holiday",
      severity: "info",
      sheetRow: null,
      date: "2026-12-08",
      message: "Labelled Week 2 but marked as a holiday: no lessons that day",
    },
  ]));

test("uncertain wording on a labelled day is a warning that quotes only the matched phrase", () =>
  expect(found.filter((f) => f.kind === "possible-day-off")).toEqual([
    expect.objectContaining({
      date: "2027-03-19",
      severity: "warning",
      message:
        "Labelled as a teaching day but the calendar says 'holiday'. Check whether you have lessons",
    }),
    expect.objectContaining({
      date: "2027-05-04",
      message: expect.stringContaining("'staff training'"),
    }),
    expect.objectContaining({
      date: "2027-06-29",
      message: expect.stringContaining("'staff only'"),
    }),
  ]));

test("findings never repeat the rest of the cell", () => {
  for (const f of found) {
    expect(f.message).not.toMatch(/\?\?|Staff training day|Official holiday/);
  }
});

test("days outside term and unlabelled days are not reported", () =>
  expect(found.map((f) => f.date)).not.toContain("2026-10-12"));

test("DATES OF IMPORTANCE is checked too", () => {
  const rows = syntheticRows().map((r) =>
    r.date === "2026-11-24"
      ? { ...r, datesOfImportance: "Closed to pupils" }
      : r,
  );
  expect(
    dayOffFindings(rows, SYNTHETIC_TERMS).find((f) => f.date === "2026-11-24"),
  ).toMatchObject({ kind: "possible-day-off" });
});
