import {
  buildSlots,
  type CalendarDay,
  type Fortnight,
  fortnights,
  toCalendarDays,
} from "@planner/domain";
import {
  SEED_GROUPS,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { expect, test } from "vitest";
import { boardFor, fortnightContaining } from "./board-model.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const slots = buildSlots({
  days,
  timetables: [SEED_TIMETABLE],
  groups: SEED_GROUPS,
  disruptions: [],
});
const all = fortnights(days);
const board = (f: Fortnight) => boardFor(f, days, slots, [SEED_TIMETABLE]);
const cellsOf = (week: ReturnType<typeof board>["w1"]) =>
  (week?.days ?? []).flatMap((d) => d.cells);

test("the fortnight of 14 December has a two-day Week 2", () => {
  const b = board({ w1: "2026-12-14", w2: "2026-12-21", breakBefore: false });
  expect(b.w2?.shortWeek).toBe(true);
  expect(b.w1?.shortWeek).toBe(false);
  expect(
    b.w2?.days.filter((d) => d.dayKind === "pupil").map((d) => d.date),
  ).toEqual(["2026-12-21", "2026-12-22"]);
});

test("a day that is not a pupil day has no-school cells", () => {
  const b = board({ w1: "2026-12-14", w2: "2026-12-21", breakBefore: false });
  const wednesday = b.w2?.days[2];
  expect(wednesday?.date).toBe("2026-12-23");
  expect(wednesday?.dayKind).not.toBe("pupil");
  expect(wednesday?.cells).toHaveLength(6);
  expect(wednesday?.cells.every((c) => c.kind === "no-school")).toBe(true);
});

test("the lone Friday is a short Week 1 with one lesson", () => {
  const b = board({ w1: "2027-01-04", w2: "2027-01-11", breakBefore: true });
  expect(b.w1?.shortWeek).toBe(true);
  const lessons = cellsOf(b.w1).filter((c) => c.kind === "lesson");
  expect(lessons.map((c) => [c.label, c.date, c.period])).toEqual([
    ["13 1", "2027-01-08", 6],
  ]);
});

test("a double is marked as joining the next period", () => {
  const b = board({ w1: "2026-11-16", w2: "2026-11-23", breakBefore: false });
  const thursday = b.w1?.days.find((d) => d.date === "2026-11-19");
  const p3 = thursday?.cells.find((c) => c.period === 3);
  const p4 = thursday?.cells.find((c) => c.period === 4);
  expect(p3?.label).toBe("13 3");
  expect(p3?.joinsNext).toBe(true);
  expect(p4?.label).toBe("13 3");
  expect(p4?.joinsNext).toBe(false);
});

test("a duty cell is a duty, not a lesson", () => {
  const b = board({ w1: "2026-11-16", w2: "2026-11-23", breakBefore: false });
  const friday = b.w1?.days.find((d) => d.date === "2026-11-20");
  const p1 = friday?.cells.find((c) => c.period === 1);
  expect(p1).toMatchObject({ kind: "duty", label: "400", slot: null });
});

test("a free period is empty", () => {
  const b = board({ w1: "2026-11-16", w2: "2026-11-23", breakBefore: false });
  const empties = cellsOf(b.w1).filter((c) => c.kind === "empty");
  expect(empties.length).toBeGreaterThan(0);
  expect(empties.every((c) => c.label === null && c.slot === null)).toBe(true);
});

test("a lesson cell carries its slot", () => {
  const b = board({ w1: "2027-01-04", w2: "2027-01-11", breakBefore: true });
  const lesson = cellsOf(b.w1).find((c) => c.kind === "lesson");
  expect(lesson?.slot?.key).toBe("13 1|2027-01-08|6");
});

test("with no Week 1 the left side is null", () =>
  expect(
    board({ w1: null, w2: "2026-09-07", breakBefore: false }).w1,
  ).toBeNull());

test("a week with no Week 2 leaves the right side null", () =>
  expect(
    board({ w1: "2026-09-07", w2: null, breakBefore: false }).w2,
  ).toBeNull());

test("an ordinary week is not mixed", () => {
  const b = board({ w1: "2026-11-16", w2: "2026-11-23", breakBefore: false });
  expect(b.w1?.mixed).toBe(false);
  expect(b.w1?.labels).toEqual(["W1"]);
});

test("a mixed week takes each day's cells from that day's own label", () => {
  // Monday and Tuesday are Week 2, Wednesday to Friday are Week 1 (3 to 7 May 2027).
  const labelOf = (date: string): "W1" | "W2" =>
    date <= "2027-05-04" ? "W2" : "W1";
  const mixedDays: CalendarDay[] = [
    "2027-05-03",
    "2027-05-04",
    "2027-05-05",
    "2027-05-06",
    "2027-05-07",
  ].map((date) => ({
    date,
    weekLabel: labelOf(date),
    kind: "pupil",
    pupilDay: true,
    text: null,
  }));
  const mixedSlots = buildSlots({
    days: mixedDays,
    timetables: [SEED_TIMETABLE],
    groups: SEED_GROUPS,
    disruptions: [],
  });
  expect(fortnights(mixedDays)).toEqual([
    { w1: null, w2: "2027-05-03", breakBefore: false },
  ]);
  const b = boardFor(
    { w1: null, w2: "2027-05-03", breakBefore: false },
    mixedDays,
    mixedSlots,
    [SEED_TIMETABLE],
  );
  expect(b.w2?.mixed).toBe(true);
  expect(b.w2?.labels).toEqual(["W2", "W1"]);
  expect(b.w2?.shortWeek).toBe(false);
  const lessonsOn = (date: string) =>
    b.w2?.days
      .find((d) => d.date === date)
      ?.cells.filter((c) => c.kind === "lesson")
      .map((c) => `${c.period}:${c.label}`) ?? [];
  const expected = (date: string) =>
    mixedSlots
      .filter((s) => s.date === date)
      .map((s) => `${s.period}:${s.groupId}`);
  for (const date of ["2027-05-03", "2027-05-05"]) {
    expect(lessonsOn(date)).toEqual(expected(date));
    expect(lessonsOn(date).length).toBeGreaterThan(0);
  }
});

test("fortnightContaining finds the fortnight that holds the date", () => {
  expect(fortnightContaining(all, "2026-11-20")?.w1).toBe("2026-11-16");
  expect(fortnightContaining(all, "2026-11-29")?.w2).toBe("2026-11-23");
});

test("fortnightContaining falls forward from a holiday", () =>
  expect(fortnightContaining(all, "2026-12-28")?.w1).toBe("2027-01-04"));

test("fortnightContaining after the last fortnight is null", () =>
  expect(fortnightContaining(all, "2027-08-01")).toBeNull());
