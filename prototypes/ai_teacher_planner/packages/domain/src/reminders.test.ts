import { SEED_GROUPS } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import type { IsoDate } from "./dates.ts";
import {
  type ParentsEvening,
  type ReportWindow,
  reminders,
} from "./reminders.ts";

const win = (over: Partial<ReportWindow>): ReportWindow => ({
  id: "w",
  yearGroup: 11,
  programme: null,
  name: "Report 2: Long",
  dataDeadline: "2026-11-30",
  hodReview: null,
  sentHome: null,
  ...over,
});
const y11Window = win({});
const y7Window = win({ id: "w7", yearGroup: 7, name: "Report 1" });
const y12Ib = win({ id: "ib", yearGroup: 12, programme: "IB" });
const y12ALevel = win({ id: "al", yearGroup: 12, programme: "A level" });

const remindersFor = (w: ReportWindow, today: IsoDate = "2026-11-20") =>
  reminders({
    today,
    windows: [w],
    evenings: [],
    groups: SEED_GROUPS,
    horizonDays: 14,
  });

test("a deadline ten days ahead is shown with the days left, for her group in that year", () =>
  expect(
    reminders({
      today: "2026-11-20",
      windows: [y11Window],
      evenings: [],
      groups: SEED_GROUPS,
      horizonDays: 14,
    }),
  ).toEqual([
    {
      kind: "report-data-deadline",
      date: "2026-11-30",
      daysLeft: 10,
      label: "Year 11 Report 2: Long: data deadline",
      groupIds: ["11D"],
    },
  ]));
test("a deadline for a year she does not teach is not shown", () =>
  expect(remindersFor(y7Window)).toEqual([]));
test("a Year 12 IB deadline is for IB S and IB H; a Year 12 A level deadline is for nobody", () => {
  expect(remindersFor(y12Ib)[0]?.groupIds).toEqual(["IB H", "IB S"]);
  expect(remindersFor(y12ALevel)).toEqual([]);
});
test("past deadlines and those beyond the horizon are not shown; today's is shown with 0", () => {
  const at = (d: IsoDate) => remindersFor(win({ dataDeadline: d }));
  expect(at("2026-11-19")).toEqual([]);
  expect(at("2026-11-20")[0]?.daysLeft).toBe(0);
  expect(at("2026-12-04")[0]?.daysLeft).toBe(14);
  expect(at("2026-12-05")).toEqual([]);
});
test("a deadline with no date is never shown", () =>
  expect(remindersFor({ ...y11Window, dataDeadline: null })).toEqual([]));

describe("parents' evenings", () => {
  const eve = (over: Partial<ParentsEvening>): ParentsEvening => ({
    id: "e",
    yearGroup: 13,
    label: "Parent Meeting",
    date: "2026-11-26",
    ...over,
  });
  const run = (evenings: ParentsEvening[]) =>
    reminders({
      today: "2026-11-20",
      windows: [],
      evenings,
      groups: SEED_GROUPS,
      horizonDays: 14,
    });
  test("shown for the groups of that year", () =>
    expect(run([eve({})])).toEqual([
      {
        kind: "parents-evening",
        date: "2026-11-26",
        daysLeft: 6,
        label: "Year 13 Parent Meeting",
        groupIds: ["13 1", "13 3", "13 5"],
      },
    ]));
  test("an evening with no year, no date or no group is not shown", () =>
    expect(
      run([
        eve({ yearGroup: null }),
        eve({ date: null }),
        eve({ yearGroup: 8 }),
      ]),
    ).toEqual([]));
});

test("reminders are sorted by date, then label", () => {
  const out = reminders({
    today: "2026-11-20",
    windows: [
      win({ id: "b", dataDeadline: "2026-11-30", name: "B" }),
      win({ id: "a", dataDeadline: "2026-11-30", name: "A" }),
      win({ id: "c", dataDeadline: "2026-11-22", name: "C" }),
    ],
    evenings: [
      {
        id: "e",
        yearGroup: 13,
        label: "Parent Meeting",
        date: "2026-11-26",
      },
    ],
    groups: SEED_GROUPS,
    horizonDays: 14,
  });
  expect(out.map((r) => r.label)).toEqual([
    "Year 11 C: data deadline",
    "Year 13 Parent Meeting",
    "Year 11 A: data deadline",
    "Year 11 B: data deadline",
  ]);
});
