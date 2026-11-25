import { expect, test } from "vitest";
import { paceWorld } from "./pace-world.ts";

const open = (group: string, from: string, to: string) =>
  paceWorld()
    .slots.filter(
      (s) =>
        s.groupId === group &&
        s.status === "open" &&
        s.date >= from &&
        s.date <= to,
    )
    .map((s) => `${s.date.slice(5)} P${s.period}`);

test("the world is the three Year 13 groups on the seed timetable, with no disruptions", () => {
  const w = paceWorld();
  expect(w.groups.map((g) => g.id)).toEqual(["13 1", "13 3", "13 5"]);
  expect(w.today).toBe("2026-11-09");
  expect(w.exams).toEqual([]);
  expect(w.revisionWeeks).toBe(2);
  expect(w.previous).toBeNull();
  expect(w.slots.every((s) => s.status === "open")).toBe(true);
  expect(w.positions.map((p) => [p.groupId, p.nextLessonId])).toEqual([
    ["13 1", "c1#1"],
    ["13 3", "c1#1"],
    ["13 5", "c1#1"],
  ]);
});

test("the scheme is c1, c2, a1, c3, c4, in that order", () => {
  const w = paceWorld();
  expect(w.items.map((i) => [i.id, i.kind, i.lessons])).toEqual([
    ["c1", "teaching", 3],
    ["c2", "teaching", 3],
    ["a1", "assessment", 0],
    ["c3", "teaching", 4],
    ["c4", "teaching", 2],
  ]);
  expect(w.items[2]?.assessment).toMatchObject({
    date: "2026-11-27",
    slotUse: "whole",
  });
});

test("the open slots before each group's assessment match the plan's table", () => {
  expect(open("13 1", "2026-11-09", "2026-11-26")).toHaveLength(8);
  expect(open("13 3", "2026-11-09", "2026-12-01")).toHaveLength(10);
  expect(open("13 5", "2026-11-09", "2026-11-26")).toHaveLength(8);
  expect(
    open("13 3", "2026-11-09", "2026-11-30").map((s) => s.slice(0, 5)),
  ).toEqual([
    "11-10",
    "11-12",
    "11-12",
    "11-17",
    "11-19",
    "11-19",
    "11-24",
    "11-26",
    "11-26",
  ]);
});

test("the a1 slots are Fri P6, Tue P5 and Fri P4", () => {
  expect(open("13 1", "2026-11-27", "2026-11-27")).toEqual(["11-27 P6"]);
  expect(open("13 3", "2026-12-01", "2026-12-01")).toEqual(["12-01 P5"]);
  expect(open("13 5", "2026-11-27", "2026-11-27")).toEqual(["11-27 P4"]);
});

test("the slots after a1, to the end of T1b, number 10, 8 and 9 (8 December is a holiday)", () => {
  expect(open("13 1", "2026-11-28", "2026-12-22")).toHaveLength(10);
  expect(open("13 3", "2026-12-02", "2026-12-22")).toEqual([
    "12-03 P3",
    "12-03 P4",
    "12-10 P3",
    "12-10 P4",
    "12-15 P5",
    "12-17 P3",
    "12-17 P4",
    "12-22 P5",
  ]);
  expect(open("13 5", "2026-11-28", "2026-12-22")).toHaveLength(9);
  expect(paceWorld().slots.some((s) => s.date === "2026-12-08")).toBe(false);
});

test("the world has teaching blocks, and T1b ends on 22 December", () => {
  const b = paceWorld().blocks.find((x) => x.id === "T1b");
  expect(b?.to).toBe("2026-12-22");
});
