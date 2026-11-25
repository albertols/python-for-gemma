import { paceWorld } from "@planner/fixtures";
import { expect, test } from "vitest";
import { expandLessons } from "./lessons.ts";
import { TEACHER } from "./provenance.ts";
import type { SowItem } from "./scheme.ts";

const world = paceWorld();
const lessonIds = expandLessons(world.items, [], "13 1", "core").map(
  (l) => l.id,
);

test("expandLessons numbers each item's lessons from 1", () =>
  expect(
    expandLessons(world.items, [], "13 1", "core")
      .slice(0, 4)
      .map((l) => l.id),
  ).toEqual(["c1#1", "c1#2", "c1#3", "c2#1"]));

test("each lesson knows its place in its item", () => {
  const c3 = expandLessons(world.items, [], "13 1", "core").filter(
    (l) => l.itemId === "c3",
  );
  expect(c3.map((l) => [l.index, l.of, l.kind])).toEqual([
    [1, 4, "teaching"],
    [2, 4, "teaching"],
    [3, 4, "teaching"],
    [4, 4, "teaching"],
  ]);
});

test("an assessment is not a lesson", () => {
  expect(world.items.some((i) => i.id === "a1")).toBe(true);
  expect(lessonIds).not.toContain("a1#1");
  expect(lessonIds).toHaveLength(12);
});

test("an override changes one group's count and nobody else's", () => {
  const o = [{ groupId: "13 3", itemId: "c3", lessons: 3 }];
  expect(
    expandLessons(world.items, o, "13 3", "core").filter(
      (l) => l.itemId === "c3",
    ),
  ).toHaveLength(3);
  expect(
    expandLessons(world.items, o, "13 1", "core").filter(
      (l) => l.itemId === "c3",
    ),
  ).toHaveLength(4);
});

test("an override of 0 removes the item for that group", () => {
  const o = [{ groupId: "13 3", itemId: "c2", lessons: 0 }];
  const ids = expandLessons(world.items, o, "13 3", "core").map((l) => l.id);
  expect(ids.some((id) => id.startsWith("c2#"))).toBe(false);
  expect(ids).toHaveLength(9);
});

test("only the group's track is expanded", () => {
  const items: SowItem[] = [
    ...world.items,
    {
      ...(world.items.find((i) => i.id === "c1") as SowItem),
      id: "h1",
      order: 99,
      track: "hl",
      lessons: 2,
      provenance: TEACHER,
    },
  ];
  const core = expandLessons(items, [], "13 1", "core").map((l) => l.itemId);
  expect(core).not.toContain("h1");
  const hl = expandLessons(items, [], "13 1", "hl");
  expect(hl.map((l) => l.id)).toEqual(["h1#1", "h1#2"]);
});

test("lessons follow the items' order, not the order they were given in", () => {
  const shuffled = [...world.items].reverse();
  expect(expandLessons(shuffled, [], "13 1", "core").map((l) => l.id)).toEqual(
    lessonIds,
  );
});
