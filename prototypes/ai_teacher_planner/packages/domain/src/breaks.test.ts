import { SYNTHETIC_TERMS, syntheticRows } from "@planner/fixtures";
import { expect, test } from "vitest";
import { lastDaysBeforeBreaks } from "./breaks.ts";
import { toCalendarDays } from "./calendar.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);

test("the synthetic year's last days before half-term, winter and Easter are found; a single holiday is not a break", () => {
  const found = lastDaysBeforeBreaks(days);
  expect(found).toEqual([
    "2026-10-30", // autumn half-term
    "2026-12-22", // winter holiday
    "2027-02-12", // spring half-term
    "2027-03-19", // Easter
    "2027-06-29", // the summer gap
  ]);
  // 12 Oct 2026 is one official holiday and 8 Dec 2026 another: neither is a break.
  expect(found).not.toContain("2026-10-09");
  expect(found).not.toContain("2026-12-07");
});

test("a shorter minimum counts shorter gaps, a longer one fewer", () => {
  expect(lastDaysBeforeBreaks(days, 1)).toContain("2026-10-09");
  expect(lastDaysBeforeBreaks(days, 10)).toEqual([
    "2026-12-22",
    "2027-03-19",
    "2027-06-29",
  ]);
});

const pupil = (date: string) =>
  ({
    date,
    weekLabel: "W1",
    labelSource: "calendar",
    kind: "pupil",
    pupilDay: true,
    text: null,
  }) as const;

test("four weekdays off is not a break, five is, and the weekend does not count", () => {
  // Friday 4 Sep, then Monday 7 to Thursday 10 off (4 weekdays): back on Friday 11.
  expect(
    lastDaysBeforeBreaks([pupil("2026-09-04"), pupil("2026-09-11")]),
  ).toEqual(["2026-09-11"]);
  // Friday 4 Sep, then Monday 7 to Friday 11 off (5 weekdays): back on Monday 14.
  expect(
    lastDaysBeforeBreaks([pupil("2026-09-04"), pupil("2026-09-14")]),
  ).toEqual(["2026-09-04", "2026-09-14"]);
  // Friday to Monday is only a weekend.
  expect(
    lastDaysBeforeBreaks([pupil("2026-09-04"), pupil("2026-09-07")]),
  ).toEqual(["2026-09-07"]);
});

test("no days, no breaks", () => {
  expect(lastDaysBeforeBreaks([])).toEqual([]);
});
