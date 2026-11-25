import { paceWorld } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import type { Pin, PlanInputs, PlanSnapshot } from "./plan.ts";
import { sequence } from "./sequence.ts";
import type { Slot } from "./slots.ts";

/** The world cut down to group 13 1 unless a test asks for more. */
function world(groups: string[] = ["13 1"]): PlanInputs {
  const w = paceWorld();
  return {
    ...w,
    groups: w.groups.filter((g) => groups.includes(g.id)),
    slots: w.slots.filter((s) => groups.includes(s.groupId)),
    positions: w.positions.filter((p) => groups.includes(p.groupId)),
  };
}
const slotOn = (w: PlanInputs, group: string, date: string): Slot => {
  const s = w.slots.find((x) => x.groupId === group && x.date === date);
  if (!s) throw new Error(`no slot for ${group} on ${date}`);
  return s;
};
const setStatus = (w: PlanInputs, key: string, status: Slot["status"]) => {
  const s = w.slots.find((x) => x.key === key);
  if (!s) throw new Error(`no slot ${key}`);
  s.status = status;
};
/** Lesson to slot, in slot order, for lessons of the scheme (not spare lessons). */
const placed = (snap: PlanSnapshot, group: string) =>
  snap.placements
    .filter(
      (p) =>
        p.groupId === group &&
        p.slotKey !== null &&
        !p.lessonId.startsWith("flex:") &&
        p.state === "planned",
    )
    .sort((a, b) => ((a.slotKey ?? "") < (b.slotKey ?? "") ? -1 : 1))
    .map((p) => [p.lessonId, p.slotKey]);
const placementOf = (snap: PlanSnapshot, group: string, lesson: string) =>
  snap.placements.find((p) => p.groupId === group && p.lessonId === lesson);
const lessonAt = (snap: PlanSnapshot, key: string) =>
  snap.placements.find((p) => p.slotKey === key)?.lessonId;
const setA1 = (w: PlanInputs, patch: object) => {
  const a1 = w.items.find((i) => i.id === "a1");
  if (!a1?.assessment) throw new Error("no a1");
  Object.assign(a1.assessment, patch);
};

describe("the stream", () => {
  test("lessons fill the earliest open slots in scheme order", () =>
    expect(placed(sequence(world()), "13 1").slice(0, 4)).toEqual([
      ["c1#1", "13 1|2026-11-09|5"],
      ["c1#2", "13 1|2026-11-11|2"],
      ["c1#3", "13 1|2026-11-13|6"],
      ["c2#1", "13 1|2026-11-16|5"],
    ]));

  test("a position starts the stream there and declares everything before it", () => {
    const w = world();
    w.positions = [
      { groupId: "13 1", nextLessonId: "c1#3", doneItemIds: [], asOf: w.today },
    ];
    const snap = sequence(w);
    for (const id of ["c1#1", "c1#2"])
      expect(placementOf(snap, "13 1", id)).toMatchObject({
        state: "declared",
        slotKey: null,
      });
    expect(placementOf(snap, "13 1", "c1#3")?.slotKey).toBe(
      "13 1|2026-11-09|5",
    );
  });

  test("a done-list declares an item taught out of order", () => {
    const w = world();
    w.positions = [
      {
        groupId: "13 1",
        nextLessonId: "c1#3",
        doneItemIds: ["c2"],
        asOf: w.today,
      },
    ];
    const snap = sequence(w);
    for (const id of ["c2#1", "c2#2", "c2#3"])
      expect(placementOf(snap, "13 1", id)?.state).toBe("declared");
    expect(placed(snap, "13 1").slice(0, 2)).toEqual([
      ["c1#3", "13 1|2026-11-09|5"],
      ["c3#1", "13 1|2026-11-11|2"],
    ]);
  });

  test("a position of null means the course is finished", () => {
    const w = world();
    w.positions = [
      { groupId: "13 1", nextLessonId: null, doneItemIds: [], asOf: w.today },
    ];
    const snap = sequence(w);
    const lessons = snap.placements.filter(
      (p) => !p.lessonId.startsWith("flex:"),
    );
    expect(lessons).toHaveLength(12);
    expect(
      lessons.every((p) => p.state === "declared" && p.slotKey === null),
    ).toBe(true);
    expect(snap.overflow).toEqual([]);
  });
});

describe("assessments", () => {
  test("a dated whole-slot assessment takes the group's first open slot on or after its date", () =>
    expect(sequence(world()).assessments).toContainEqual({
      groupId: "13 1",
      itemId: "a1",
      slotKey: "13 1|2026-11-27|6",
      slotUse: "whole",
    }));

  test("no lesson shares a slot with a whole-slot assessment", () => {
    const snap = sequence(world());
    expect(lessonAt(snap, "13 1|2026-11-27|6")).toBeUndefined();
    // the 8 slots before it are full, and c3#1 follows the assessment's slot
    expect(
      placed(snap, "13 1")
        .map(([id]) => id)
        .slice(6, 9),
    ).toEqual(["c3#1", "c3#2", "c3#3"]);
  });

  test("an in-lesson assessment is attached to the slot and a lesson is still taught there", () => {
    const w = world();
    setA1(w, { durationMinutes: 18, slotUse: "in-lesson" });
    const snap = sequence(w);
    expect(snap.assessments).toContainEqual({
      groupId: "13 1",
      itemId: "a1",
      slotKey: "13 1|2026-11-27|6",
      slotUse: "in-lesson",
    });
    expect(lessonAt(snap, "13 1|2026-11-27|6")).toBeDefined();
  });

  test("the sequencer reads slotUse only: a 55-minute assessment marked in-lesson is a chip, not a whole slot", () => {
    const w = world();
    setA1(w, { durationMinutes: 55, slotUse: "in-lesson" });
    const snap = sequence(w);
    expect(snap.assessments).toEqual([
      {
        groupId: "13 1",
        itemId: "a1",
        slotKey: "13 1|2026-11-27|6",
        slotUse: "in-lesson",
      },
    ]);
    expect(lessonAt(snap, "13 1|2026-11-27|6")).toBeDefined();
  });

  test("a short assessment marked whole still takes the whole slot", () => {
    const w = world();
    setA1(w, { durationMinutes: 5, slotUse: "whole" });
    const snap = sequence(w);
    expect(snap.assessments[0]?.slotUse).toBe("whole");
    expect(lessonAt(snap, "13 1|2026-11-27|6")).toBeUndefined();
  });

  test("an assessment with no slot within seven days is a conflict", () => {
    const w = world();
    setA1(w, { date: "2026-12-23" });
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual({
      kind: "assessment-no-slot",
      groupId: "13 1",
      itemId: "a1",
      date: "2026-12-23",
    });
    expect(snap.assessments).toEqual([]);
  });

  test("an undated assessment is placed in scheme order, after the lessons before it", () => {
    const w = world();
    setA1(w, { date: null });
    const snap = sequence(w);
    // c1 and c2 take six slots; the assessment takes the seventh (23 Nov)
    expect(snap.assessments).toEqual([
      {
        groupId: "13 1",
        itemId: "a1",
        slotKey: slotOn(w, "13 1", "2026-11-23").key,
        slotUse: "whole",
      },
    ]);
    expect(placementOf(snap, "13 1", "c2#3")?.slotKey).toBe(
      slotOn(w, "13 1", "2026-11-20").key,
    );
    expect(placementOf(snap, "13 1", "c3#1")?.slotKey).toBe(
      slotOn(w, "13 1", "2026-11-25").key,
    );
  });

  test("a sat assessment is not planned again", () => {
    const w = world();
    setA1(w, { status: "sat" });
    const snap = sequence(w);
    expect(snap.assessments).toEqual([]);
    expect(snap.conflicts).toEqual([]);
    expect(lessonAt(snap, "13 1|2026-11-27|6")).toBeDefined();
  });

  test("a planned assessment dated before today is a conflict, not anchored at today's first slot", () => {
    const w = world();
    setA1(w, { date: "2026-11-06" });
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual({
      kind: "assessment-no-slot",
      groupId: "13 1",
      itemId: "a1",
      date: "2026-11-06",
    });
    expect(snap.assessments).toEqual([]);
  });
});

describe("pins and merges", () => {
  const slotPin = (lessonId: string, slotKey: string): Pin => ({
    id: `p-${lessonId}`,
    groupId: "13 1",
    lessonId,
    kind: "slot",
    slotKey,
  });

  test("a slot pin fixes a lesson and the rest flow around it", () => {
    const w = world();
    w.pins = [slotPin("c2#1", "13 1|2026-11-09|5")];
    const snap = sequence(w);
    expect(placementOf(snap, "13 1", "c2#1")).toMatchObject({
      slotKey: "13 1|2026-11-09|5",
      pinned: true,
    });
    expect(placementOf(snap, "13 1", "c1#1")).toMatchObject({
      slotKey: "13 1|2026-11-11|2",
      pinned: false,
    });
    expect(snap.conflicts).toEqual([]);
  });

  test("a pin to a cancelled slot is a conflict and the lesson stays in the stream", () => {
    const w = world();
    const key = slotOn(w, "13 1", "2026-11-18").key;
    setStatus(w, key, "cancelled");
    w.pins = [slotPin("c2#1", key)];
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual(
      expect.objectContaining({
        kind: "pin-slot-unavailable",
        lessonId: "c2#1",
      }),
    );
    expect(placementOf(snap, "13 1", "c2#1")).toMatchObject({
      pinned: false,
      state: "planned",
    });
    expect(placementOf(snap, "13 1", "c2#1")?.slotKey).not.toBeNull();
  });

  test("a pin to another group's slot is a conflict", () => {
    const w = world(["13 1", "13 3"]);
    const other = slotOn(w, "13 3", "2026-11-10").key;
    expect(other).toBe("13 3|2026-11-10|5"); // a slot that really exists, for the other group
    w.pins = [slotPin("c2#1", other)];
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual(
      expect.objectContaining({
        kind: "pin-slot-unavailable",
        groupId: "13 1",
        lessonId: "c2#1",
        slotKey: other,
      }),
    );
    expect(placementOf(snap, "13 1", "c2#1")?.slotKey).not.toBe(other);
  });

  test("a not-after deadline that is met changes nothing", () => {
    const w = world();
    const plain = sequence(w);
    w.pins = [
      {
        id: "n1",
        groupId: "13 1",
        lessonId: "c2#2",
        kind: "not-after",
        date: "2026-11-18",
      },
    ];
    const snap = sequence(w);
    expect(snap.conflicts).toEqual([]);
    expect(snap.placements).toEqual(plain.placements);
  });

  test("a not-after deadline that is missed is a conflict with the planned date, and nothing is reordered", () => {
    const w = world();
    const plain = sequence(w);
    w.pins = [
      {
        id: "n1",
        groupId: "13 1",
        lessonId: "c2#2",
        kind: "not-after",
        date: "2026-11-17",
      },
    ];
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual(
      expect.objectContaining({
        kind: "not-after-missed",
        pinId: "n1",
        lessonId: "c2#2",
        plannedDate: "2026-11-18",
      }),
    );
    expect(snap.placements).toEqual(plain.placements);
  });

  test("merged lessons share one slot", () => {
    const w = world();
    w.merges = [{ id: "m1", groupId: "13 1", first: "c1#2", second: "c1#3" }];
    const snap = sequence(w);
    const key = "13 1|2026-11-11|2";
    expect(placementOf(snap, "13 1", "c1#2")).toMatchObject({
      slotKey: key,
      mergedInto: null,
    });
    expect(placementOf(snap, "13 1", "c1#3")).toMatchObject({
      slotKey: key,
      mergedInto: "c1#2",
    });
    expect(placementOf(snap, "13 1", "c2#1")?.slotKey).toBe(
      "13 1|2026-11-13|6",
    );
  });
});

describe("slots", () => {
  test("cancelled slots are skipped", () => {
    const w = world();
    setStatus(w, slotOn(w, "13 1", "2026-11-11").key, "cancelled");
    const snap = sequence(w);
    expect(placementOf(snap, "13 1", "c1#2")?.slotKey).toBe(
      "13 1|2026-11-13|6",
    );
    expect(snap.placements.some((p) => p.slotKey === "13 1|2026-11-11|2")).toBe(
      false,
    );
  });

  test("a cover slot is used and marked", () => {
    const w = world();
    const key = slotOn(w, "13 1", "2026-11-11").key;
    setStatus(w, key, "cover");
    const snap = sequence(w);
    expect(placementOf(snap, "13 1", "c1#2")).toMatchObject({
      slotKey: key,
      viaCover: true,
    });
    expect(placementOf(snap, "13 1", "c1#1")?.viaCover).toBe(false);
  });

  test("slots before today are not used", () => {
    const w = world();
    w.today = "2026-11-16";
    const snap = sequence(w);
    expect(placementOf(snap, "13 1", "c1#1")?.slotKey).toBe(
      "13 1|2026-11-16|5",
    );
  });

  test("what does not fit in the year is overflow at the last checkpoint", () => {
    const w = world();
    // With no revision block (Task 2.3) the last checkpoint is the last block end.
    w.revisionWeeks = 0;
    const c4 = w.items.find((i) => i.id === "c4");
    if (c4) c4.lessons = 400;
    const snap = sequence(w);
    const last = snap.checkpoints.at(-1);
    const o = snap.overflow.at(-1);
    expect(o).toMatchObject({ groupId: "13 1", checkpointId: last?.id });
    expect(o?.lessonIds.length).toBeGreaterThan(0);
    expect(o?.lessonIds.at(-1)).toBe("c4#400");
    expect(placementOf(snap, "13 1", "c4#400")).toBeUndefined();
    expect(snap.placements.some((p) => p.lessonId.startsWith("flex:"))).toBe(
      false,
    );
  });

  test("slots left after the last lesson become spare lessons, named for the checkpoint of their window", () => {
    const snap = sequence(world());
    const spare = snap.placements.filter((p) =>
      p.lessonId.startsWith("flex:13 1:"),
    );
    expect(spare.length).toBeGreaterThan(0);
    expect(
      spare.every((p) => p.state === "planned" && p.slotKey !== null),
    ).toBe(true);
    expect(snap.checkpoints.at(-1)?.id).toMatch(/^cp:block:T3/);
    // Task 2.3: the pace line plans window by window, so the first spare lesson
    // belongs to the window where the scheme runs out (T1b), not the last checkpoint.
    expect(spare[0]?.lessonId).toBe("flex:13 1:cp:block:T1b#1");
    const lastLesson = placementOf(snap, "13 1", "c4#2")?.slotKey ?? "";
    expect(spare.every((p) => (p.slotKey ?? "") > lastLesson)).toBe(true);
    expect(new Set(spare.map((p) => p.lessonId)).size).toBe(spare.length);
  });
});

describe("bad references are reported, never guessed", () => {
  test("a position naming a lesson that is not in the scheme plans nothing for that group", () => {
    const w = world(["13 1", "13 3"]);
    w.positions = [
      { groupId: "13 1", nextLessonId: "c3#9", doneItemIds: [], asOf: w.today },
      { groupId: "13 3", nextLessonId: "c1#1", doneItemIds: [], asOf: w.today },
    ];
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual({
      kind: "position-unknown",
      groupId: "13 1",
      lessonId: "c3#9",
    });
    expect(snap.placements.filter((p) => p.groupId === "13 1")).toEqual([]);
    expect(snap.assessments.filter((a) => a.groupId === "13 1")).toEqual([]);
    expect(snap.overflow.filter((o) => o.groupId === "13 1")).toEqual([]);
    // the other group is planned as usual
    expect(placementOf(snap, "13 3", "c1#1")?.slotKey).not.toBeNull();
  });

  test("a slot pin on a lesson that is not in the scheme is a conflict", () => {
    const w = world();
    const key = slotOn(w, "13 1", "2026-11-18").key;
    w.pins = [
      {
        id: "p1",
        groupId: "13 1",
        lessonId: "c3#9",
        kind: "slot",
        slotKey: key,
      },
    ];
    const snap = sequence(w);
    expect(snap.conflicts).toContainEqual({
      kind: "pin-lesson-unknown",
      pinId: "p1",
      groupId: "13 1",
      lessonId: "c3#9",
      slotKey: key,
    });
    expect(lessonAt(snap, key)).not.toBe("c3#9");
  });

  test("a not-after pin on a lesson that is not in the scheme is a conflict", () => {
    const w = world();
    w.pins = [
      {
        id: "n1",
        groupId: "13 1",
        lessonId: "c3#9",
        kind: "not-after",
        date: "2026-12-01",
      },
    ];
    expect(sequence(w).conflicts).toContainEqual({
      kind: "pin-lesson-unknown",
      pinId: "n1",
      groupId: "13 1",
      lessonId: "c3#9",
      slotKey: null,
    });
  });

  test("a pin on a lesson already taught is moot, not a conflict", () => {
    const w = world();
    w.positions = [
      { groupId: "13 1", nextLessonId: "c1#3", doneItemIds: [], asOf: w.today },
    ];
    w.pins = [
      {
        id: "p1",
        groupId: "13 1",
        lessonId: "c1#1",
        kind: "slot",
        slotKey: slotOn(w, "13 1", "2026-11-18").key,
      },
    ];
    expect(sequence(w).conflicts).toEqual([]);
  });

  test("an undated assessment right at her position is the next thing to do", () => {
    const w = world();
    setA1(w, { date: null });
    w.positions = [
      { groupId: "13 1", nextLessonId: "c3#1", doneItemIds: [], asOf: w.today },
    ];
    const snap = sequence(w);
    expect(snap.assessments).toEqual([
      {
        groupId: "13 1",
        itemId: "a1",
        slotKey: "13 1|2026-11-09|5",
        slotUse: "whole",
      },
    ]);
    expect(placementOf(snap, "13 1", "c3#1")?.slotKey).toBe(
      "13 1|2026-11-11|2",
    );
  });

  test("doneItemIds is how she says an undated assessment is done", () => {
    const w = world();
    setA1(w, { date: null });
    w.positions = [
      {
        groupId: "13 1",
        nextLessonId: "c3#1",
        doneItemIds: ["a1"],
        asOf: w.today,
      },
    ];
    const snap = sequence(w);
    expect(snap.assessments).toEqual([]);
    expect(placementOf(snap, "13 1", "c3#1")?.slotKey).toBe(
      "13 1|2026-11-09|5",
    );
  });

  test("an undated in-lesson assessment after overflowed content is a conflict, not attached to an earlier lesson", () => {
    const w = world();
    setA1(w, { date: null, slotUse: "in-lesson", durationMinutes: 18 });
    const c2 = w.items.find((i) => i.id === "c2");
    if (c2) c2.lessons = 400;
    const snap = sequence(w);
    expect(snap.assessments).toEqual([]);
    expect(snap.conflicts).toContainEqual({
      kind: "assessment-no-slot",
      groupId: "13 1",
      itemId: "a1",
      date: w.today,
    });
  });
});

describe("anchors", () => {
  test("a dated in-lesson anchor does not land on a slot a later whole-slot assessment takes", () => {
    const w = world();
    setA1(w, { slotUse: "in-lesson", durationMinutes: 18 });
    const a1 = w.items.find((i) => i.id === "a1");
    if (!a1?.assessment) throw new Error("no a1");
    w.items.push({
      ...a1,
      id: "a2",
      order: 4,
      title: "a2",
      assessment: { ...a1.assessment, slotUse: "whole", durationMinutes: 45 },
    });
    const snap = sequence(w);
    const whole = snap.assessments.find((a) => a.itemId === "a2");
    const chip = snap.assessments.find((a) => a.itemId === "a1");
    expect(whole).toMatchObject({
      slotKey: "13 1|2026-11-27|6",
      slotUse: "whole",
    });
    expect(chip?.slotKey).not.toBe(whole?.slotKey);
    expect(lessonAt(snap, whole?.slotKey ?? "")).toBeUndefined();
    expect(lessonAt(snap, chip?.slotKey ?? "")).toBeDefined();
  });
});

describe("checkpoints and order", () => {
  test("with no checkpoint there are no spare lessons and overflow has no checkpoint", () => {
    const w = world();
    w.blocks = [];
    w.revisionWeeks = 0; // a revision block is a checkpoint too (Task 2.3)
    setA1(w, { status: "sat" });
    const c4 = w.items.find((i) => i.id === "c4");
    if (c4) c4.lessons = 400;
    const snap = sequence(w);
    expect(snap.checkpoints).toEqual([]);
    expect(snap.placements.some((p) => p.lessonId.startsWith("flex:"))).toBe(
      false,
    );
    expect(snap.overflow).toEqual([
      expect.objectContaining({ groupId: "13 1", checkpointId: null }),
    ]);
  });

  test("checkpoints hold the dated assessments and each block end from today, by date", () => {
    const snap = sequence(world());
    const cps = snap.checkpoints;
    expect(cps.find((c) => c.id === "cp:a1")).toMatchObject({
      kind: "assessment",
      date: "2026-11-27",
      itemId: "a1",
    });
    expect(cps.find((c) => c.id === "cp:block:T1b")).toMatchObject({
      kind: "block-end",
      date: "2026-12-22",
      itemId: null,
    });
    expect(
      cps.every((c) => c.kind !== "block-end" || c.date >= "2026-11-09"),
    ).toBe(true);
    expect(cps.map((c) => c.date)).toEqual([...cps.map((c) => c.date)].sort());
  });

  test("each group starts in its own first slot and sits a1 in its own slot", () => {
    const snap = sequence(world(["13 1", "13 3", "13 5"]));
    const w = world(["13 1", "13 3", "13 5"]);
    for (const g of ["13 3", "13 5"])
      expect(placementOf(snap, g, "c1#1")?.slotKey).toBe(
        slotOn(w, g, "2026-11-10").key,
      );
    expect(snap.assessments.map((a) => [a.groupId, a.slotKey])).toEqual([
      ["13 1", "13 1|2026-11-27|6"],
      ["13 3", "13 3|2026-12-01|5"],
      ["13 5", "13 5|2026-11-27|4"],
    ]);
  });
});
