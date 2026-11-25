import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  calendarWorkbookPath,
  resourcesAvailable,
} from "../resources-available.ts";
import {
  type ImportedParentsEvening,
  type ImportedReportWindow,
  readParentsEvenings,
  readReportDeadlines,
} from "./read-reports.ts";

const ay = { start: 2026, end: 2027 };
const bytes = resourcesAvailable()
  ? new Uint8Array(await readFile(calendarWorkbookPath()))
  : null;
const windows: ImportedReportWindow[] = bytes
  ? await readReportDeadlines(bytes, ay)
  : [];
const evenings: ImportedParentsEvening[] = bytes
  ? await readParentsEvenings(bytes, ay)
  : [];

// Runs only where the school's workbook is on disk. It asserts counts and
// dates, never cell text, so a failure message cannot leak her file.
describe.skipIf(!resourcesAvailable())(
  "the school's real report sheets",
  () => {
    test("the Year 11 Report 2 data deadline is 30 Nov 2026", () =>
      expect(
        windows.some(
          (w) =>
            w.yearGroup === 11 &&
            w.name.startsWith("Report 2") &&
            w.dataDeadline.date === "2026-11-30",
        ),
      ).toBe(true));
    test("every Year 12 and 13 window has a programme", () =>
      expect(
        windows.filter((w) => w.yearGroup >= 12 && w.programme === null).length,
      ).toBe(0));
    test("Years 12 and 13 each have A level and IB windows", () => {
      for (const y of [12, 13])
        for (const p of ["A level", "IB"])
          expect(
            windows.filter((w) => w.yearGroup === y && w.programme === p)
              .length,
          ).toBeGreaterThan(0);
    });
    test("a Year 13 parents' evening is on 26 Nov 2026", () =>
      expect(
        evenings.some(
          (e) => e.yearGroup === 13 && e.date.date === "2026-11-26",
        ),
      ).toBe(true));
  },
);
