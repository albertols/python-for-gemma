import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { type CalendarImport, readCalendarWorkbook } from "../index.ts";
import {
  calendarWorkbookPath,
  resourcesAvailable,
} from "../resources-available.ts";

const load = async (): Promise<CalendarImport> =>
  readCalendarWorkbook(new Uint8Array(await readFile(calendarWorkbookPath())));
const imp = resourcesAvailable() ? await load() : null;

// Runs only where the school's calendar is on disk. It asserts counts and
// dates, never cell text, so a failure message cannot leak her file.
describe.skipIf(!resourcesAvailable())("the school's real calendar", () => {
  const need = (): CalendarImport => {
    if (!imp) throw new Error("calendar not loaded");
    return imp;
  };
  const count = (l: "W1" | "W2") =>
    need().rows.filter((r) => r.weekLabel === l).length;
  const label = (d: string) => need().rows.find((r) => r.date === d)?.weekLabel;
  const findings = (kind: string) =>
    need().findings.filter((f) => f.kind === kind);

  test("label counts", () => {
    expect(count("W1")).toBe(91);
    expect(count("W2")).toBe(94);
  });

  test("the dates that break a simple alternation", () => {
    expect(label("2027-02-12")).toBe("W2");
    expect(label("2027-02-22")).toBe("W1");
    expect(label("2026-12-21")).toBe("W2");
    expect(label("2026-12-22")).toBe("W2");
    expect(label("2027-01-07")).toBeNull();
    expect(label("2027-01-08")).toBe("W1");
  });

  test("known oddities are reported, and nothing else is", () => {
    expect(findings("unknown-label").map((f) => f.date)).toEqual([
      "2026-10-31",
    ]);
    expect(findings("weekday-mismatch").map((f) => f.date)).toEqual([
      "2026-07-11",
    ]);
    expect(
      findings("date-gap").length + findings("unparseable-row").length,
    ).toBe(4);
    expect(findings("merged-cells")).toEqual([]);
    for (const kind of [
      "missing-header",
      "missing-sheet",
      "label-on-weekend",
      "year-block-mismatch",
      "assrep-mismatch",
    ])
      expect(findings(kind), kind).toHaveLength(0);
    expect(need().findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  test("the only label oddity is the mixed week of 3 May 2027", () =>
    expect(findings("label-issue")).toEqual([
      expect.objectContaining({
        date: "2027-05-03",
        message: expect.stringContaining("both Week 1 and Week 2"),
      }),
    ]));
});
