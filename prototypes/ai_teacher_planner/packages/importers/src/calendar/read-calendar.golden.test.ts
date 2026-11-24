import { readFile } from "node:fs/promises";
import {
  auditSlots,
  buildSlots,
  checkLabels,
  type Disruption,
  type FindingResolution,
  type LabelCorrection,
  teachingBlocks,
  termSpanning,
  toCalendarDays,
} from "@planner/domain";
import { SEED_GROUPS, SEED_TERMS, SEED_TIMETABLE } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import {
  type CalendarImport,
  dayOffFindings,
  readCalendarWorkbook,
  tidyFindings,
} from "../index.ts";
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

  // The school's terms for 2026-27 are the ones the synthetic year uses.
  const days = () => toCalendarDays(need().rows, SEED_TERMS);
  const dayOffs = (kind: string) =>
    dayOffFindings(need().rows, SEED_TERMS)
      .filter((f) => f.kind === kind)
      .map((f) => f.date);

  test("single-day official holidays that carry a week label are holidays", () => {
    const holidays = [
      "2026-10-12",
      "2026-11-09",
      "2026-12-07",
      "2026-12-08",
      "2027-05-03",
    ];
    expect(
      days()
        .filter((d) => d.kind === "holiday")
        .map((d) => d.date),
    ).toEqual(holidays);
    expect(dayOffs("labelled-holiday")).toEqual(holidays);
  });

  test("uncertain labelled days are flagged, not acted on", () => {
    expect(dayOffs("possible-day-off")).toEqual([
      "2027-03-19",
      "2027-05-04",
      "2027-06-29",
    ]);
    for (const d of ["2027-03-19", "2027-05-04", "2027-06-29"])
      expect(days().find((x) => x.date === d)?.pupilDay).toBe(true);
  });

  test("the fortnight of 16 November 2026 keeps its lesson counts", () => {
    const slots = buildSlots({
      days: days(),
      timetables: [SEED_TIMETABLE],
      groups: SEED_GROUPS,
      disruptions: [],
    }).filter((s) => s.date >= "2026-11-16" && s.date <= "2026-11-27");
    const per = (id: string) => slots.filter((s) => s.groupId === id).length;
    expect(
      Object.fromEntries(
        ["11D", "IB H", "IB S", "13 1", "13 3", "13 5"].map((id) => [
          id,
          per(id),
        ]),
      ),
    ).toEqual({
      "11D": 5,
      "IB H": 4,
      "IB S": 6,
      "13 1": 6,
      "13 3": 6,
      "13 5": 6,
    });
  });

  test("the slot audit's days off are exactly the five official holidays", () => {
    const d = days();
    const slots = buildSlots({
      days: d,
      timetables: [SEED_TIMETABLE],
      groups: SEED_GROUPS,
      disruptions: [],
    });
    const audit = auditSlots({
      slots,
      days: d,
      blocks: teachingBlocks(d, SEED_TERMS),
      timetables: [SEED_TIMETABLE],
      groups: SEED_GROUPS,
      disruptions: [],
    });
    expect(audit.daysOff.map((x) => x.date)).toEqual([
      "2026-10-12",
      "2026-11-09",
      "2026-12-07",
      "2026-12-08",
      "2027-05-03",
    ]);
  });

  describe("with her corrections applied in memory", () => {
    // Nothing is written anywhere: the corrections only exist inside this test.
    const labels: LabelCorrection[] = [
      { date: "2027-05-04", weekLabel: "W1", note: null },
    ];
    const resolutions: FindingResolution[] = [
      { date: "2027-03-19", decision: "no-lessons", reason: null },
      { date: "2027-06-29", decision: "no-lessons", reason: null },
      { date: "2027-05-04", decision: "teaching-day", reason: null },
    ];
    const fixed = () => toCalendarDays(need().rows, SEED_TERMS, labels);
    const school = (date: string): Disruption => ({
      id: `day:${date}`,
      scope: { kind: "school" },
      from: date,
      to: date,
      periods: null,
      effect: "cancelled",
      reason: "No lessons (your correction)",
      source: "teacher",
    });

    test("W1 has 92 labels and W2 has 93", () => {
      const n = (l: "W1" | "W2") =>
        fixed().filter((d) => d.weekLabel === l).length;
      expect([n("W1"), n("W2")]).toEqual([92, 93]);
      expect(
        fixed()
          .filter((d) => d.labelSource === "teacher")
          .map((d) => d.date),
      ).toEqual(["2027-05-04"]);
    });

    test("the week of 3 May 2027 is not mixed", () => {
      const issues = checkLabels(
        toCalendarDays(need().rows, termSpanning(need().rows), labels),
      );
      expect(issues.map((i) => i.weekOf)).not.toContain("2027-05-03");
    });

    test("no possible-day-off warning remains, and the August and weekend notes are folded away", () => {
      const report = tidyFindings(
        [...need().findings, ...dayOffFindings(need().rows, SEED_TERMS)],
        SEED_TERMS,
        resolutions,
      );
      expect(report.shown.filter((f) => f.kind === "possible-day-off")).toEqual(
        [],
      );
      expect(report.resolved.map((r) => r.finding.date)).toEqual([
        "2027-03-19",
        "2027-05-04",
        "2027-06-29",
      ]);
      const outside = report.outsideYear.map((f) => f.date);
      expect(outside).toEqual(
        expect.arrayContaining(["2026-07-11", "2026-10-31"]),
      );
      expect(report.shown.map((f) => f.date)).not.toContain("2026-10-31");
    });

    test("all of 13 1's slots on 19 March 2027 are cancelled", () => {
      const slots = buildSlots({
        days: fixed(),
        timetables: [SEED_TIMETABLE],
        groups: SEED_GROUPS,
        disruptions: [school("2027-03-19"), school("2027-06-29")],
      }).filter((s) => s.date === "2027-03-19" && s.groupId === "13 1");
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => s.status === "cancelled")).toBe(true);
    });

    test("the fortnight of 16 November 2026 still gives 5, 4, 6, 6, 6, 6", () => {
      const slots = buildSlots({
        days: fixed(),
        timetables: [SEED_TIMETABLE],
        groups: SEED_GROUPS,
        disruptions: [school("2027-03-19"), school("2027-06-29")],
      }).filter((s) => s.date >= "2026-11-16" && s.date <= "2026-11-27");
      const per = (id: string) => slots.filter((s) => s.groupId === id).length;
      expect(["11D", "IB H", "IB S", "13 1", "13 3", "13 5"].map(per)).toEqual([
        5, 4, 6, 6, 6, 6,
      ]);
    });
  });
});
