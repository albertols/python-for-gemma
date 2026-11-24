import { SYNTHETIC_TERMS, syntheticRows } from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  type CalendarDay,
  checkLabels,
  fortnights,
  teachingBlocks,
  toCalendarDays,
} from "./calendar.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const day = (d: string) => days.find((x) => x.date === d);
const label = (d: string) => day(d)?.weekLabel;
const relabel = (
  from: string,
  to: string,
  weekLabel: "W1" | "W2",
): CalendarDay[] =>
  days.map((x) =>
    x.date >= from && x.date <= to && x.weekLabel ? { ...x, weekLabel } : x,
  );

test("the synthetic year has the real year's traps", () => {
  expect(label("2026-11-24")).toBe("W2");
  expect(label("2026-12-21")).toBe("W2");
  expect(label("2026-12-22")).toBe("W2");
  expect(label("2027-01-07")).toBeNull();
  expect(label("2027-01-08")).toBe("W1");
  expect(label("2027-02-12")).toBe("W2");
  expect(label("2027-02-22")).toBe("W1");
});
test("a labelled day before term is not a pupil day", () =>
  expect(day("2026-09-01")).toMatchObject({
    weekLabel: "W1",
    kind: "outside-term",
    pupilDay: false,
  }));
test("the first day of term is a pupil day", () =>
  expect(day("2026-09-04")).toMatchObject({ kind: "pupil", pupilDay: true }));
test("an unlabelled weekday in term is not a pupil day and keeps its text", () =>
  expect(day("2026-10-12")).toMatchObject({
    kind: "unlabelled",
    pupilDay: false,
    text: "Official Holiday",
  }));
test("a weekend is never a pupil day, whatever its label cell says", () =>
  expect(day("2026-10-31")).toMatchObject({
    weekLabel: null,
    kind: "weekend",
    pupilDay: false,
  }));
test("checkLabels finds nothing wrong in the synthetic year", () =>
  expect(checkLabels(days)).toEqual([]));
test("checkLabels reports a week with two labels", () => {
  const changed = days.map((x) =>
    x.date === "2026-09-09" ? { ...x, weekLabel: "W1" as const } : x,
  );
  expect(checkLabels(changed)).toContainEqual(
    expect.objectContaining({
      kind: "mixed-labels-in-week",
      weekOf: "2026-09-07",
    }),
  );
});
test("checkLabels reports two labelled weeks in a row with one label", () => {
  const changed = relabel("2026-09-14", "2026-09-18", "W2");
  expect(checkLabels(changed)).toContainEqual(
    expect.objectContaining({
      kind: "labels-do-not-alternate",
      weekOf: "2026-09-14",
    }),
  );
});
test("teaching blocks split at a full week off and at term ends, not at a single day off", () =>
  expect(teachingBlocks(days, SYNTHETIC_TERMS).slice(0, 4)).toEqual([
    { id: "T1a", termId: "T1", from: "2026-09-04", to: "2026-10-30" },
    { id: "T1b", termId: "T1", from: "2026-11-09", to: "2026-12-22" },
    { id: "T2a", termId: "T2", from: "2027-01-08", to: "2027-02-12" },
    { id: "T2b", termId: "T2", from: "2027-02-22", to: "2027-03-19" },
  ]));
test("fortnights pair a Week 1 week with the Week 2 week after it", () => {
  const f = fortnights(days);
  expect(f).toContainEqual({
    w1: "2026-12-14",
    w2: "2026-12-21",
    breakBefore: false,
  });
  expect(f).toContainEqual({
    w1: "2027-01-04",
    w2: "2027-01-11",
    breakBefore: true,
  });
  expect(f).toContainEqual({
    w1: "2027-02-22",
    w2: "2027-03-01",
    breakBefore: true,
  });
});
test("a Week 2 week with no Week 1 before it stands alone", () => {
  const fromW2 = days.filter((x) => x.date >= "2026-09-07");
  expect(fortnights(fromW2)[0]).toMatchObject({ w1: null });
});

// A fixed shuffle: reverse the halves and interleave, no randomness.
const shuffle = <T>(xs: readonly T[]): T[] =>
  [...xs].sort(
    (a, b) => ((xs.indexOf(a) * 7919) % 101) - ((xs.indexOf(b) * 7919) % 101),
  );

test("the week functions do not depend on the order of days or terms", () => {
  const shuffled = shuffle(days);
  const terms = shuffle(SYNTHETIC_TERMS);
  expect(shuffled).not.toEqual(days);
  expect(teachingBlocks(shuffled, terms)).toEqual(
    teachingBlocks(days, SYNTHETIC_TERMS),
  );
  expect(fortnights(shuffled)).toEqual(fortnights(days));
  expect(checkLabels(shuffled)).toEqual(checkLabels(days));
  const changed = relabel("2026-09-14", "2026-09-18", "W2");
  expect(checkLabels(shuffle(changed))).toEqual(checkLabels(changed));
});
