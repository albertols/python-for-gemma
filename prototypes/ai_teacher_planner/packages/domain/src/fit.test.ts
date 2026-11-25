import { paceWorld } from "@planner/fixtures";
import { expect, test } from "vitest";
import { fitFor } from "./fit.ts";
import type { PlanInputs } from "./plan.ts";
import { sequence } from "./sequence.ts";

/** Usable slots from today to the group's revision block, less the slot its whole-slot a1 takes. */
const contentSlots = (w: PlanInputs, groupId: string) => {
  const revision = sequence(w).checkpoints.find((c) => c.kind === "revision");
  const start = revision?.perGroupDate?.[groupId] ?? "9999-12-31";
  const usable = w.slots.filter(
    (s) =>
      s.groupId === groupId &&
      s.status !== "cancelled" &&
      s.date >= w.today &&
      s.date < start,
  );
  return usable.length - 1;
};

test("fitFor fits the base world", () =>
  expect(fitFor(paceWorld()).every((f) => f.fits)).toBe(true));

test("in the base world every group has its 12 lessons left and every content slot until revision", () => {
  const w = paceWorld();
  expect(fitFor(w)).toEqual(
    ["13 1", "13 3", "13 5"].map((groupId) => ({
      groupId,
      lessonsLeft: 12,
      slotsLeft: contentSlots(w, groupId),
      fits: true,
      over: 0,
    })),
  );
});

test("fitFor says how many lessons are over when the scheme is too long", () => {
  const w = paceWorld();
  const c4 = w.items.find((i) => i.id === "c4");
  if (!c4) throw new Error("no c4");
  // The brief says 40, but paceWorld runs to June: 13 1, 13 3 and 13 5 have 78, 77 and 76
  // content slots, so 50 lessons fit. 80 makes the scheme 90 lessons, too long for every group.
  c4.lessons = 80;
  const fits = fitFor(w);
  expect(fits.map((f) => [f.groupId, f.slotsLeft])).toEqual([
    ["13 1", 78],
    ["13 3", 77],
    ["13 5", 76],
  ]);
  for (const f of fits) {
    expect(f.fits).toBe(false);
    expect(f.lessonsLeft).toBe(90);
    // at least the lessons there is no slot for; more when the pace line left a
    // spare lesson in an early window that a later lesson cannot reach back to
    expect(f.over).toBeGreaterThanOrEqual(f.lessonsLeft - f.slotsLeft);
  }
});

test("lessons already taught are not left, and an override counts for its group only", () => {
  const w = paceWorld();
  w.positions = w.positions.map((p) =>
    p.groupId === "13 1" ? { ...p, nextLessonId: "c2#1" } : p,
  );
  w.overrides = [{ groupId: "13 5", itemId: "c4", lessons: 5 }];
  const byGroup = Object.fromEntries(fitFor(w).map((f) => [f.groupId, f]));
  expect(byGroup["13 1"]?.lessonsLeft).toBe(9);
  expect(byGroup["13 3"]?.lessonsLeft).toBe(12);
  expect(byGroup["13 5"]?.lessonsLeft).toBe(15);
});
