import { SYNTHETIC_TERMS, syntheticRows } from "@planner/fixtures";
import { expect, test } from "vitest";
import { checkLabels, toCalendarDays } from "./calendar.ts";
import { canCorrectLabel, type LabelCorrection } from "./corrections.ts";

const rows = syntheticRows();
const terms = SYNTHETIC_TERMS;
const dayOn = (days: ReturnType<typeof toCalendarDays>, date: string) =>
  days.find((d) => d.date === date);
const fix = (date: string, weekLabel: "W1" | "W2"): LabelCorrection => ({
  date,
  weekLabel,
  note: null,
});

test("a label correction wins over the calendar and says so", () => {
  // 2027-05-04 is Week 1 in the synthetic year; correct it to Week 2.
  const raw = dayOn(toCalendarDays(rows, terms), "2027-05-04");
  const other = raw?.weekLabel === "W1" ? "W2" : "W1";
  expect(
    dayOn(
      toCalendarDays(rows, terms, [fix("2027-05-04", other)]),
      "2027-05-04",
    ),
  ).toMatchObject({ weekLabel: other, labelSource: "teacher", kind: "pupil" });
});

test("removing the correction brings back the calendar label", () => {
  const before = toCalendarDays(rows, terms);
  const flipped = toCalendarDays(rows, terms, [fix("2027-05-04", "W1")]);
  const after = toCalendarDays(rows, terms, []);
  expect(after).toEqual(before);
  expect(dayOn(before, "2027-05-04")?.labelSource).toBe("calendar");
  expect(dayOn(flipped, "2027-05-04")?.labelSource).toBe("teacher");
});

test("every day without a correction, labelled or not, comes from the calendar", () => {
  const days = toCalendarDays(rows, terms, [fix("2027-05-04", "W1")]);
  expect(
    days.filter((d) => d.labelSource === "teacher").map((d) => d.date),
  ).toEqual(["2027-05-04"]);
  expect(dayOn(days, "2026-10-12")?.labelSource).toBe("calendar");
});

test("a correction on a weekend or outside term is ignored", () => {
  const days = toCalendarDays(rows, terms, [
    fix("2026-10-31", "W1"),
    fix("2026-09-01", "W2"),
  ]);
  expect(days).toEqual(toCalendarDays(rows, terms));
});

test("a correction can label an unlabelled weekday in term", () => {
  expect(
    dayOn(toCalendarDays(rows, terms, [fix("2026-10-14", "W1")]), "2026-10-14"),
  ).toMatchObject({ weekLabel: "W1", labelSource: "teacher" });
});

test("a week whose holiday has another label is not mixed", () => {
  // The labelled official holiday of 8 December has the week's other label flipped on it.
  const days = toCalendarDays(rows, terms, [fix("2027-05-04", "W1")]).map(
    (d) =>
      d.date === "2026-12-08"
        ? {
            ...d,
            weekLabel: d.weekLabel === "W1" ? ("W2" as const) : ("W1" as const),
          }
        : d,
  );
  expect(checkLabels(days)).toEqual([]);
});

test("canCorrectLabel is true only for a weekday in term", () => {
  expect(canCorrectLabel("2027-05-04", terms)).toBe(true);
  expect(canCorrectLabel("2026-10-31", terms)).toBe(false);
  expect(canCorrectLabel("2026-09-01", terms)).toBe(false);
  expect(canCorrectLabel("2026-08-17", terms)).toBe(false);
});
