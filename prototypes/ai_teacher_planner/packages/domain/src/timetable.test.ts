import { SEED_GROUPS, SEED_TIMETABLE } from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  lessonsPerFortnight,
  PERIOD_TIMES,
  type TimetableVersion,
  validateTimetable,
} from "./timetable.ts";

const withClash: TimetableVersion = {
  ...SEED_TIMETABLE,
  entries: [
    ...SEED_TIMETABLE.entries,
    { week: "W1", weekday: 1, period: 1, groupId: "13 1", room: "206" },
  ],
};
const withGhost: TimetableVersion = {
  ...SEED_TIMETABLE,
  entries: [
    ...SEED_TIMETABLE.entries,
    { week: "W1", weekday: 3, period: 1, groupId: "12X", room: null },
  ],
};

test("lessons per fortnight match her timetable", () =>
  expect(lessonsPerFortnight(SEED_TIMETABLE)).toEqual({
    "11D": { W1: 3, W2: 2, total: 5 },
    "IB H": { W1: 2, W2: 2, total: 4 },
    "IB S": { W1: 3, W2: 3, total: 6 },
    "13 1": { W1: 3, W2: 3, total: 6 },
    "13 3": { W1: 3, W2: 3, total: 6 },
    "13 5": { W1: 3, W2: 3, total: 6 },
  }));

test("the seed is valid", () =>
  expect(validateTimetable(SEED_TIMETABLE, SEED_GROUPS)).toEqual([]));

test("the seed keeps one duty per 400 cell and no lunch duties", () => {
  expect(SEED_TIMETABLE.duties).toHaveLength(16);
  expect(SEED_TIMETABLE.duties.every((d) => d.label === "400")).toBe(true);
  expect(SEED_TIMETABLE.validFrom).toBe("2026-08-31");
});

test("two groups in one period are refused", () =>
  expect(validateTimetable(withClash, SEED_GROUPS)).toHaveLength(1));

test("a lesson on top of a duty is refused", () =>
  expect(
    validateTimetable(
      {
        ...SEED_TIMETABLE,
        entries: [
          ...SEED_TIMETABLE.entries,
          { week: "W1", weekday: 5, period: 1, groupId: "13 1", room: null },
        ],
      },
      SEED_GROUPS,
    ),
  ).toHaveLength(1));

test("an unknown group is refused", () => {
  const problems = validateTimetable(withGhost, SEED_GROUPS);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("12X");
});

test("the answer does not depend on entry order", () =>
  expect(
    validateTimetable(
      { ...withClash, entries: [...withClash.entries].reverse() },
      [...SEED_GROUPS].reverse(),
    ),
  ).toEqual(validateTimetable(withClash, SEED_GROUPS)));

test("period times are 55 minutes long", () => {
  expect(PERIOD_TIMES[1]).toEqual({ start: "08:45", end: "09:40" });
  expect(PERIOD_TIMES[4]).toEqual({ start: "12:10", end: "13:05" });
  expect(PERIOD_TIMES[6]).toEqual({ start: "15:30", end: "16:25" });
});
