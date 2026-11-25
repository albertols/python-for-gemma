import { expect, test } from "vitest";
import type { TimetableVersion } from "./timetable.ts";
import { diffTimetables } from "./timetable-diff.ts";

const current: TimetableVersion = {
  id: "v1",
  validFrom: "2026-08-31",
  entries: [
    { week: "W1", weekday: 1, period: 1, groupId: "13 1", room: "101" },
    { week: "W1", weekday: 2, period: 3, groupId: "13 3", room: null },
    { week: "W2", weekday: 5, period: 6, groupId: "11D", room: "204" },
  ],
  duties: [{ week: "W1", weekday: 3, period: 2, label: "Gate" }],
};

test("diffTimetables lists only the cells that differ", () => {
  const changes = diffTimetables(current, {
    entries: [
      // same group and room: not a change
      { week: "W1", weekday: 1, period: 1, groupId: "13 1", room: "101" },
      // same group, new room: a change
      { week: "W1", weekday: 2, period: 3, groupId: "13 3", room: "305" },
      // W2 Fri P6 is no longer there; a new cell appears in W2 Mon P1
      { week: "W2", weekday: 1, period: 1, groupId: "11D", room: null },
    ],
    // the duty moves to another period
    duties: [{ week: "W1", weekday: 3, period: 4, label: "Gate" }],
  });
  expect(changes).toEqual([
    { week: "W1", weekday: 2, period: 3, from: "13 3", to: "13 3 (305)" },
    { week: "W1", weekday: 3, period: 2, from: "Duty: Gate", to: null },
    { week: "W1", weekday: 3, period: 4, from: null, to: "Duty: Gate" },
    { week: "W2", weekday: 1, period: 1, from: null, to: "11D" },
    { week: "W2", weekday: 5, period: 6, from: "11D (204)", to: null },
  ]);
});

test("identical grids have no changes, whatever the order of the entries", () => {
  expect(
    diffTimetables(current, {
      entries: [...current.entries].reverse(),
      duties: current.duties,
    }),
  ).toEqual([]);
});
