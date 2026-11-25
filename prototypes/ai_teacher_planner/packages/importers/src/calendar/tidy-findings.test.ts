import type { FindingResolution, Term } from "@planner/domain";
import { expect, test } from "vitest";
import type { ImportFinding } from "./read-calendar.ts";
import { tidyFindings } from "./tidy-findings.ts";

const terms: Term[] = [
  { id: "T1", firstPupilDay: "2026-09-04", lastPupilDay: "2026-12-22" },
  { id: "T2", firstPupilDay: "2027-01-08", lastPupilDay: "2027-03-19" },
  { id: "T3", firstPupilDay: "2027-04-05", lastPupilDay: "2027-06-29" },
];
const finding = (
  kind: ImportFinding["kind"],
  date: string | null,
  severity: ImportFinding["severity"] = "warning",
): ImportFinding => ({ kind, severity, sheetRow: null, date, message: "m" });

test("findings in August, on a Saturday, or outside every term go to outsideYear as info", () => {
  const report = tidyFindings(
    [
      finding("unknown-label", "2026-08-17"),
      finding("unknown-label", "2026-10-31"), // a Saturday
      finding("weekday-mismatch", "2026-07-11"),
      finding("unknown-label", "2026-11-17"), // a Tuesday in term
    ],
    terms,
    [],
  );
  expect(report.outsideYear.map((f) => f.date)).toEqual([
    "2026-08-17",
    "2026-10-31",
    "2026-07-11",
  ]);
  expect(report.outsideYear.every((f) => f.severity === "info")).toBe(true);
  expect(report.shown.map((f) => f.date)).toEqual(["2026-11-17"]);
  expect(report.shown[0]?.severity).toBe("warning");
});

test("a finding with no date stays shown", () => {
  const report = tidyFindings(
    [finding("missing-sheet", null, "error")],
    terms,
    [],
  );
  expect(report.shown).toHaveLength(1);
  expect(report.outsideYear).toEqual([]);
});

test("a resolved finding is listed as resolved, not as a warning", () => {
  const resolution: FindingResolution = {
    date: "2027-03-19",
    decision: "teaching-day",
    reason: null,
  };
  const f = finding("possible-day-off", "2027-03-19");
  const report = tidyFindings(
    [f, finding("possible-day-off", "2027-06-29")],
    terms,
    [resolution],
  );
  expect(report.resolved).toEqual([{ finding: f, resolution }]);
  expect(report.shown.map((x) => x.date)).toEqual(["2027-06-29"]);
});

test("a resolution does not hide a different kind of finding on its date", () => {
  const report = tidyFindings([finding("label-issue", "2027-03-15")], terms, [
    { date: "2027-03-15", decision: "no-lessons", reason: null },
  ]);
  expect(report.shown).toHaveLength(1);
  expect(report.resolved).toEqual([]);
});

test("a correction that no longer matches a day stays shown, even outside the year", () => {
  const report = tidyFindings(
    [finding("orphaned-correction", "2026-08-17", "error")],
    terms,
    [],
  );
  expect(report.shown).toHaveLength(1);
  expect(report.shown[0]?.severity).toBe("error");
  expect(report.outsideYear).toEqual([]);
});
