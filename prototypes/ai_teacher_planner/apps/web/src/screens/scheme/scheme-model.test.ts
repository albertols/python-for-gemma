import {
  fitFor,
  type GroupOverride,
  type SowItem,
  schemeTotals,
  weeksFor,
} from "@planner/domain";
import {
  paceWorld,
  SEED_TIMETABLE,
  syntheticPack,
  syntheticScheme,
} from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  addItem,
  askedStatus,
  differenceText,
  editItem,
  lessonsPerFortnight,
  moveItem,
  removeItem,
  setOverride,
  specRefsOf,
  suggestionOf,
  totalsPerGroup,
  withEdits,
} from "./scheme-model.ts";

const world = paceWorld();
const lessonsOf = (items: readonly SowItem[], id: string) =>
  items.find((i) => i.id === id)?.lessons;

test("her unsaved count edit changes the inputs for fitFor and nothing else", () => {
  const saved = world.items;
  const draft = editItem(saved, "c4", { lessons: 40 });
  const inputs = withEdits(world, draft, world.overrides);
  // the saved scheme is untouched
  expect(lessonsOf(saved, "c4")).toBe(2);
  expect(lessonsOf(world.items, "c4")).toBe(2);
  // the inputs differ from the world in c4's count only
  expect(inputs).toEqual({ ...world, items: draft });
  expect(lessonsOf(inputs.items, "c4")).toBe(40);
  expect(
    inputs.items.filter(
      (i, n) => JSON.stringify(i) !== JSON.stringify(saved[n]),
    ),
  ).toHaveLength(1);
  // and the engine sees it: 38 more lessons to teach in every group, in the same slots
  const was = fitFor(world);
  const now = fitFor(inputs);
  expect(was.map((g) => g.lessonsLeft)).toEqual([12, 12, 12]);
  expect(now.map((g) => g.lessonsLeft)).toEqual([50, 50, 50]);
  expect(now.map((g) => g.slotsLeft)).toEqual(was.map((g) => g.slotsLeft));
  expect(now.map((g) => g.fits)).toEqual([true, true, true]);
  // far more than the year holds, and every group is over by what does not fit
  const huge = withEdits(world, editItem(saved, "c4", { lessons: 100 }), []);
  expect(fitFor(huge).map((g) => [g.groupId, g.over])).toEqual([
    ["13 1", 35],
    ["13 3", 34],
    ["13 5", 35],
  ]);
});

test("a count edit of +2 raises every group's teaching total by 2", () => {
  const before = totalsPerGroup(world, lessonsPerFortnight(SEED_TIMETABLE));
  const draft = editItem(world.items, "c3", { lessons: 6 });
  const after = totalsPerGroup(
    withEdits(world, draft, world.overrides),
    lessonsPerFortnight(SEED_TIMETABLE),
  );
  expect(before.map((g) => [g.groupId, g.teaching])).toEqual([
    ["13 1", 12],
    ["13 3", 12],
    ["13 5", 12],
  ]);
  expect(after.map((g) => g.teaching)).toEqual([14, 14, 14]);
});

test("an edit by her makes the item hers, and an edit that changes nothing does not", () => {
  const imported = syntheticScheme("ial-business-u4");
  expect(imported[0]?.provenance.origin).toBe("import");
  const same = editItem(imported, "ch1", { lessons: 3 });
  expect(same).toEqual(imported);
  const changed = editItem(imported, "ch1", { lessons: 4 });
  expect(changed[0]?.provenance).toEqual({ origin: "teacher", ai: null });
  expect(changed[0]?.lessons).toBe(4);
  expect(changed.slice(1)).toEqual(imported.slice(1));
});

test("the timetable gives 6 lessons a fortnight to each Year 13 group, so 6 lessons are 2 weeks", () => {
  const per = lessonsPerFortnight(SEED_TIMETABLE);
  expect(per["13 1"]).toBe(6);
  expect(per["13 3"]).toBe(6);
  expect(weeksFor(6, per["13 1"] ?? 0)).toBe(2);
  const totals = totalsPerGroup(world, per);
  expect(totals.map((g) => g.lessonsPerFortnight)).toEqual([6, 6, 6]);
});

test("totals agree with the engine's own rules for one group", () => {
  const per = lessonsPerFortnight(SEED_TIMETABLE);
  const [first] = totalsPerGroup(world, per);
  const engine = schemeTotals(world.items, world.overrides, "13 1");
  const fit = fitFor(world).find((g) => g.groupId === "13 1");
  expect(first).toMatchObject({
    groupId: "13 1",
    teaching: engine.teaching,
    assessments: engine.assessmentSlots,
    slotsLeft: fit?.slotsLeft,
    over: fit?.over,
    fits: true,
  });
  expect(first?.teaching).toBe(12);
  expect(first?.assessments).toBe(1);
});

test("a group's own count changes that group's total only", () => {
  const per = lessonsPerFortnight(SEED_TIMETABLE);
  const overrides = setOverride(world.overrides, "13 3", "c2", 1);
  expect(overrides).toEqual([{ groupId: "13 3", itemId: "c2", lessons: 1 }]);
  const totals = totalsPerGroup(withEdits(world, world.items, overrides), per);
  expect(totals.map((g) => g.teaching)).toEqual([12, 10, 12]);
  // clearing it puts the group back on the item's own count
  expect(setOverride(overrides, "13 3", "c2", null)).toEqual([]);
});

test("moving an item swaps it with its neighbour and renumbers the order", () => {
  const down = moveItem(world.items, "c1", 1);
  expect(down.map((i) => i.id)).toEqual(["c2", "c1", "a1", "c3", "c4"]);
  expect(down.map((i) => i.order)).toEqual([1, 2, 3, 4, 5]);
  // at the ends nothing moves
  expect(moveItem(world.items, "c1", -1).map((i) => i.id)).toEqual(
    world.items.map((i) => i.id),
  );
  expect(moveItem(world.items, "c4", 1).map((i) => i.id)).toEqual(
    world.items.map((i) => i.id),
  );
  // dropped to a place, not just one step
  expect(moveItem(world.items, "c4", -3).map((i) => i.id)).toEqual([
    "c1",
    "c4",
    "c2",
    "a1",
    "c3",
  ]);
});

test("a new item goes last with an id nothing uses, and an assessment gets details", () => {
  const withNew = addItem(world.items, "ial-business-u4", "teaching");
  expect(withNew).toHaveLength(6);
  const added = withNew[5];
  expect(added).toMatchObject({
    id: "teaching-1",
    order: 6,
    kind: "teaching",
    lessons: 1,
    packRefs: [],
    provenance: { origin: "teacher", ai: null },
  });
  const twice = addItem(withNew, "ial-business-u4", "teaching");
  expect(twice[6]?.id).toBe("teaching-2");
  const test2 = addItem(world.items, "ial-business-u4", "assessment")[5];
  expect(test2?.lessons).toBe(0);
  expect(test2?.assessment).toEqual({
    date: null,
    type: "Assessment",
    marks: null,
    durationMinutes: null,
    slotUse: "whole",
    status: "planned",
    covers: [],
  });
});

const standing = { pins: [], merges: [], positions: [] };

test("an item nothing depends on can be deleted, with its group counts; one that is covered cannot", () => {
  const items = syntheticScheme("ial-business-u4");
  const blocked = removeItem(items, [], "ch1", standing);
  expect(blocked).toEqual({
    ok: false,
    blockedBy: ['the assessment "20 mark" covers it'],
  });
  const overrides: GroupOverride[] = [
    { groupId: "13 1", itemId: "ch4", lessons: 1 },
    { groupId: "13 1", itemId: "ch2", lessons: 3 },
  ];
  const gone = removeItem(items, overrides, "ch4", standing);
  expect(gone.ok).toBe(true);
  if (gone.ok) {
    expect(gone.items.map((i) => i.id)).toEqual([
      "ch1",
      "ch2",
      "a-ch2",
      "ch3",
      "a-ch3",
    ]);
    expect(gone.overrides).toEqual([
      { groupId: "13 1", itemId: "ch2", lessons: 3 },
    ]);
  }
});

test("a pin, a merge or a group's position on an item's lessons stops the delete on the screen too", () => {
  const items = syntheticScheme("ial-business-u4");
  const pin = {
    pins: [{ lessonId: "ch4#1" }],
    merges: [],
    positions: [],
  };
  expect(removeItem(items, [], "ch4", pin)).toEqual({
    ok: false,
    blockedBy: ["a pin holds one of its lessons"],
  });
  const at = {
    pins: [],
    merges: [],
    positions: [{ nextLessonId: "ch4#2", doneItemIds: [] }],
  };
  expect(removeItem(items, [], "ch4", at)).toEqual({
    ok: false,
    blockedBy: ["a group is at one of its lessons or has finished it"],
  });
});

test("spec references come from the chapters an item is linked to", () => {
  const pack = syntheticPack();
  const items = syntheticScheme("ial-business-u4");
  expect(specRefsOf(items[0] as SowItem, pack)).toEqual({
    chapters: ["Chapter 1: Invented chapter 1"],
    codes: ["1.1", "1.2"],
  });
  const unlinked = addItem(items, "ial-business-u4", "teaching").at(-1);
  expect(specRefsOf(unlinked as SowItem, pack)).toEqual({
    chapters: [],
    codes: [],
  });
});

test("a lesson-count suggestion is read as a difference, and anything else is not", () => {
  const item = {
    kind: "lesson-count",
    target: "ch3",
    data: {
      itemId: "ch3",
      title: "Markets",
      from: 4,
      to: 5,
      reason: "Needs worked examples.",
      tricky: true,
    },
  };
  expect(suggestionOf(item)).toEqual({
    from: 4,
    to: 5,
    reason: "Needs worked examples.",
    tricky: true,
  });
  expect(differenceText(4, 5)).toBe("4 → 5");
  expect(differenceText(null, 5)).toBe("5");
  expect(suggestionOf({ ...item, kind: "other" })).toBeNull();
  expect(suggestionOf({ ...item, data: { to: "5" } })).toBeNull();
  expect(suggestionOf({ ...item, data: null })).toBeNull();
});

test("after a run, the status line says nothing differs only when the run made no suggestions", () => {
  const run = (itemIds: string[], note: string | null = null) => ({
    status: "done" as const,
    failure: null,
    note,
    itemIds,
  });
  expect(askedStatus(run([]))).toEqual({
    text: "No suggestion differs from your numbers.",
    problem: false,
  });
  // a suggestion that was made, and has since been accepted, is not "no suggestion"
  expect(askedStatus(run(["item-1"]))).toBeNull();
  expect(askedStatus(run(["item-1"], "1 suggestion was left out."))).toEqual({
    text: "1 suggestion was left out.",
    problem: false,
  });
  expect(
    askedStatus({
      status: "failed",
      failure: "Claude took too long and was stopped. Nothing was saved.",
      note: null,
      itemIds: [],
    }),
  ).toEqual({
    text: "Claude took too long and was stopped. Nothing was saved.",
    problem: true,
  });
  expect(askedStatus(null)).toBeNull();
});
