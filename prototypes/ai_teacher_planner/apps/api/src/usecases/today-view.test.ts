import fs from "node:fs";
import { afterAll, expect, test } from "vitest";
import { seededRepos } from "../test-support.ts";
import { placementsIn } from "./placements.ts";
import { todayView } from "./today-view.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const seeded = async (state: "m1b" | "m2-planned") => {
  const s = await seededRepos(state);
  dirs.push(s.dataDir);
  return s;
};

test("each of today's lessons carries the lesson the plan puts there, the same one the board shows", async () => {
  const { repos } = await seeded("m2-planned");
  const view = todayView(repos, "2026-11-20");
  expect(view.lessons.map((l) => [l.slot.key, l.lesson])).toEqual([
    [
      "13 1|2026-11-20|6",
      { lessonId: "ch3#2", title: "Markets", kind: "teaching" },
    ],
  ]);
  const board = placementsIn(repos, "2026-11-20", "2026-11-20", "2026-11-20");
  expect(board.placements.map((p) => [p.slotKey, p.lessonId])).toEqual([
    ["13 1|2026-11-20|6", "ch3#2"],
  ]);
});

test("a spare lesson on Today is called a spare lesson", async () => {
  const { repos } = await seeded("m2-planned");
  const lesson = todayView(repos, "2026-11-26").lessons.find(
    (l) => l.slot.key === "13 3|2026-11-26|4",
  )?.lesson;
  expect(lesson).toEqual({
    lessonId: "flex:13 3:cp:a-ch2#1",
    title: "Spare lesson",
    kind: "flex",
  });
});

test("without a plan, today's lessons carry no lesson", async () => {
  const { repos } = await seeded("m1b");
  const view = todayView(repos, "2026-11-20");
  expect(view.lessons).toHaveLength(1);
  expect(view.lessons[0]?.lesson).toBeNull();
});

test("a whole-slot assessment on Today is named, so Today and the board agree", async () => {
  const { repos } = await seeded("m2-planned");
  const row = todayView(repos, "2026-11-27").lessons.find(
    (l) => l.slot.key === "13 1|2026-11-27|6",
  );
  expect(row?.lesson).toBeNull();
  expect(row?.assessment).toEqual({
    itemId: "a-ch2",
    title: "20 mark",
    slotUse: "whole",
  });
  // a lesson with no assessment says so
  const lesson = todayView(repos, "2026-11-20").lessons[0];
  expect(lesson?.assessment).toBeNull();
});
