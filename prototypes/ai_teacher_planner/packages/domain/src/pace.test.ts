import {
  paceWorld,
  SEED_EXAMS,
  SEED_TERMS,
  SEED_TIMETABLE,
  syntheticRows,
} from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import { toCalendarDays } from "./calendar.ts";
import { mondayOf } from "./dates.ts";
import {
  disruptionsFromEvents,
  type EventClassification,
  eventCandidates,
} from "./events.ts";
import type { ExternalExam } from "./exams.ts";
import type { Lesson } from "./lessons.ts";
import { planWindows } from "./pace.ts";
import type { Checkpoint, PlanInputs, PlanSnapshot } from "./plan.ts";
import type { SowItem } from "./scheme.ts";
import { sequence } from "./sequence.ts";
import { buildSlots } from "./slots.ts";

const GROUPS = ["13 1", "13 3", "13 5"] as const;

/** A plan and the questions the tests ask of it. */
function planOf(w: PlanInputs) {
  const snapshot: PlanSnapshot = sequence(w);
  const slotDate = new Map(w.slots.map((s) => [s.key, s.date]));
  const placementsOf = (g: string) =>
    snapshot.placements.filter((p) => p.groupId === g);
  const dateOf = (g: string, lessonId: string) => {
    const key = placementsOf(g).find((p) => p.lessonId === lessonId)?.slotKey;
    return key ? slotDate.get(key) : undefined;
  };
  /** The date a lesson is planned on; a test that compares dates fails loudly when the lesson is not placed. */
  const dateIn = (g: string, lessonId: string) => {
    const d = dateOf(g, lessonId);
    if (d === undefined) throw new Error(`${g} has no slot for ${lessonId}`);
    return d;
  };
  const anchorOf = (g: string, itemId: string) =>
    snapshot.assessments.find((a) => a.groupId === g && a.itemId === itemId)
      ?.slotKey ?? "";
  const anchorDate = (g: string, itemId: string) => {
    const d = slotDate.get(anchorOf(g, itemId));
    if (d === undefined) throw new Error(`${g} does not sit ${itemId}`);
    return d;
  };
  const anchors = (itemId: string) =>
    Object.fromEntries(GROUPS.map((g) => [g, anchorOf(g, itemId)]));
  const lessonAt = (key: string) =>
    snapshot.placements.find((p) => p.slotKey === key)?.lessonId;
  const flexOf = (g: string, checkpointId?: string) =>
    placementsOf(g).filter((p) =>
      p.lessonId.startsWith(
        checkpointId ? `flex:${g}:${checkpointId}#` : `flex:${g}:`,
      ),
    );
  const spareCount = (checkpointId: string) =>
    Object.fromEntries(GROUPS.map((g) => [g, flexOf(g, checkpointId).length]));
  const contentLessons = (g: string) =>
    placementsOf(g)
      .filter((p) => p.slotKey !== null && !p.lessonId.startsWith("flex:"))
      .map((p) => ({ id: p.lessonId, slotKey: p.slotKey }));
  /** 13 1 has one lesson a day, so a date names its slot. */
  const lessonOnDate = (g: string, date: string) =>
    placementsOf(g).find((p) => p.slotKey && slotDate.get(p.slotKey) === date)
      ?.lessonId;
  return {
    snapshot,
    placementsOf,
    dateOf,
    dateIn,
    anchorDate,
    anchors,
    lessonAt,
    flexOf,
    spareCount,
    contentLessons,
    lessonOnDate,
  };
}

const cancel = (w: PlanInputs, key: string) => {
  const s = w.slots.find((x) => x.key === key);
  if (!s) throw new Error(`no slot ${key}`);
  s.status = "cancelled";
};
const item = (w: PlanInputs, id: string): SowItem => {
  const i = w.items.find((x) => x.id === id);
  if (!i) throw new Error(`no item ${id}`);
  return i;
};
const setA1 = (w: PlanInputs, patch: object) => {
  const a1 = item(w, "a1");
  if (!a1.assessment) throw new Error("a1 has no assessment");
  Object.assign(a1.assessment, patch);
};
const lastSlotDate = (w: PlanInputs, g: string) =>
  w.slots
    .filter((s) => s.groupId === g && s.status !== "cancelled")
    .map((s) => s.date)
    .sort()
    .at(-1);

/** Study leave as she confirms it: the synthetic "Study leave starts" row of 11 May, for the three groups, until 29 June. */
function withStudyLeave(w: PlanInputs): PlanInputs {
  const rows = syntheticRows();
  const days = toCalendarDays(rows, SEED_TERMS);
  const build = (disruptions: ReturnType<typeof disruptionsFromEvents>) =>
    buildSlots({
      days,
      timetables: [SEED_TIMETABLE],
      groups: w.groups,
      disruptions,
    });
  const candidates = eventCandidates({
    rows,
    days,
    groups: w.groups,
    slots: build([]),
  });
  const studyLeave: EventClassification = {
    id: "sl",
    wordingKey: "study leave starts",
    yearGroup: null,
    onlyDates: ["2027-05-11"],
    decision: "cancels",
    groupIds: ["13 1", "13 3", "13 5"],
    periods: null,
    until: "2027-06-29",
    provenance: "teacher",
  };
  return {
    ...w,
    slots: build(disruptionsFromEvents(candidates, [studyLeave], w.groups)),
  };
}

/** The official IAL paper from the seed, as M1b stores it (the id is random; tests use any). */
function withExam(w: PlanInputs): PlanInputs {
  const input = SEED_EXAMS.find((e) => e.code === "WBS14 01");
  if (!input) throw new Error("no WBS14 01 in the seed");
  const exam: ExternalExam = { ...input, id: "x:3f2b-any" };
  return { ...w, exams: [exam] };
}

/** Rebuild the scheme in the given order; keeps a1 as it is in the world. */
function withScheme(w: PlanInputs, items: SowItem[]): PlanInputs {
  return { ...w, items };
}
const teaching = (
  w: PlanInputs,
  id: string,
  order: number,
  lessons: number,
  kind: SowItem["kind"] = "teaching",
): SowItem => ({ ...item(w, "c1"), id, title: id, order, lessons, kind });

describe("the pace line before an assessment", () => {
  const base = planOf(paceWorld());

  test("two lessons are brought forward for everyone, as many as the tightest group can fit", () => {
    for (const g of GROUPS)
      expect(base.dateIn(g, "c3#2") < base.anchorDate(g, "a1")).toBe(true);
    for (const g of GROUPS)
      expect(base.dateIn(g, "c3#3") > base.anchorDate(g, "a1")).toBe(true);
  });

  test("13 3's extra slot is a spare lesson in its last slot before the assessment", () =>
    expect(base.lessonAt("13 3|2026-11-26|4")).toBe("flex:13 3:cp:a1#1"));

  test("13 1 and 13 5 have no spare lesson before the assessment", () => {
    expect(base.flexOf("13 1", "cp:a1")).toEqual([]);
    expect(base.flexOf("13 5", "cp:a1")).toEqual([]);
    expect(base.spareCount("cp:a1")).toEqual({
      "13 1": 0,
      "13 3": 1,
      "13 5": 0,
    });
  });

  test("each group sits the assessment in its own first slot on or after the date", () =>
    expect(base.anchors("a1")).toEqual({
      "13 1": "13 1|2026-11-27|6",
      "13 3": "13 3|2026-12-01|5",
      "13 5": "13 5|2026-11-27|4",
    }));

  test("after the scheme runs out, every remaining slot is a spare lesson", () =>
    // slots after a1 to 22 Dec are 10, 8 and 9; four lessons each are left (c3#3, c3#4, c4#1, c4#2)
    expect(base.spareCount("cp:block:T1b")).toEqual({
      "13 1": 6,
      "13 3": 4,
      "13 5": 5,
    }));

  test("a group that loses a slot it could spare loses the spare lesson, and no content moves past the assessment", () => {
    const w = paceWorld();
    cancel(w, "13 3|2026-11-17|5");
    const lost = planOf(w);
    expect(lost.flexOf("13 3", "cp:a1")).toEqual([]);
    expect(lost.dateIn("13 3", "c3#2") < lost.anchorDate("13 3", "a1")).toBe(
      true,
    );
    expect(lost.lessonAt("13 3|2026-11-26|4")).toBe("c3#2");
    expect(lost.placementsOf("13 1")).toEqual(base.placementsOf("13 1"));
    expect(lost.placementsOf("13 5")).toEqual(base.placementsOf("13 5"));
    expect(lost.snapshot.overflow).toEqual([]);
  });

  test("a group that cannot fit what is due is short alone", () => {
    // a1 dated 2026-11-26, c1 has 4 lessons (7 due). Slots before the anchor: 13 1 has 8, 13 3 has 7, 13 5 has 7.
    const shortWorld = () => {
      const w = paceWorld();
      setA1(w, { date: "2026-11-26" });
      item(w, "c1").lessons = 4;
      return w;
    };
    const before = planOf(shortWorld());
    const w = shortWorld();
    cancel(w, "13 3|2026-11-17|5");
    const after = planOf(w);
    expect(after.snapshot.overflow).toEqual([
      { checkpointId: "cp:a1", groupId: "13 3", lessonIds: ["c2#3"] },
    ]);
    expect(after.placementsOf("13 1")).toEqual(before.placementsOf("13 1"));
    expect(after.placementsOf("13 5")).toEqual(before.placementsOf("13 5"));
    // The lesson it was short of is first in line after the assessment.
    expect(after.lessonAt("13 3|2026-11-26|4")).toBe("c2#3");
    expect(after.anchors("a1")["13 3"]).toBe("13 3|2026-11-26|3");
  });

  test("a short group never slows the others: they bring forward what they would anyway (spec 10.6)", () => {
    // Base world, but 13 3 loses four of its nine slots before a1: five slots for six lessons due.
    const w = paceWorld();
    for (const key of [
      "13 3|2026-11-17|5",
      "13 3|2026-11-19|3",
      "13 3|2026-11-24|5",
      "13 3|2026-11-26|3",
    ])
      cancel(w, key);
    const short = planOf(w);
    expect(short.snapshot.overflow).toEqual([
      { checkpointId: "cp:a1", groupId: "13 3", lessonIds: ["c2#3"] },
    ]);
    // 13 1 and 13 5 still bring c3#1 and c3#2 forward, exactly as when 13 3 is not short.
    for (const g of ["13 1", "13 5"]) {
      expect(short.dateIn(g, "c3#2") < short.anchorDate(g, "a1")).toBe(true);
      expect(short.placementsOf(g)).toEqual(base.placementsOf(g));
    }
    // 13 3 places what fits and nothing beyond what is due.
    expect(short.dateIn("13 3", "c2#2") < short.anchorDate("13 3", "a1")).toBe(
      true,
    );
    expect(short.dateIn("13 3", "c2#3") > short.anchorDate("13 3", "a1")).toBe(
      true,
    );
    expect(short.flexOf("13 3", "cp:a1")).toEqual([]);
  });

  test("a buffer before the assessment absorbs a loss the spare lesson cannot", () => {
    // a1 on 27 Nov, c1 with 4 lessons, and a one-lesson buffer b1 between c2 and a1: 8 due. Slots are 8, 9 and 8, so 13 3 has one spare lesson.
    const bufferWorld = () => {
      const w = paceWorld();
      const a1 = item(w, "a1");
      return withScheme(w, [
        teaching(w, "c1", 1, 4),
        teaching(w, "c2", 2, 3),
        teaching(w, "b1", 3, 1, "buffer"),
        { ...a1, order: 4 },
        teaching(w, "c3", 5, 4),
        teaching(w, "c4", 6, 2),
      ]);
    };
    const plain = planOf(bufferWorld());
    expect(plain.spareCount("cp:a1")).toEqual({
      "13 1": 0,
      "13 3": 1,
      "13 5": 0,
    });
    // Cancel 13 3|2026-11-17|5 and 13 3|2026-11-24|5. The first loss takes the spare lesson; the second takes the buffer.
    const w = bufferWorld();
    cancel(w, "13 3|2026-11-17|5");
    const one = planOf(w);
    expect(one.flexOf("13 3", "cp:a1")).toEqual([]);
    expect(one.snapshot.absorbed).toEqual([]);
    cancel(w, "13 3|2026-11-24|5");
    const two = planOf(w);
    expect(two.snapshot.absorbed).toEqual([
      { groupId: "13 3", lessonId: "b1#1" },
    ]);
    expect(two.snapshot.overflow).toEqual([]);
    expect(two.dateIn("13 3", "c2#3") < two.anchorDate("13 3", "a1")).toBe(
      true,
    );
    expect(two.dateOf("13 3", "b1#1")).toBeUndefined();
  });

  test("before a block end there is nothing due, so everyone is held to the group with the fewest slots", () => {
    // No assessment, and 40 lessons: T1b has 19, 18 and 18 slots from 9 Nov.
    const w = paceWorld();
    setA1(w, { status: "sat" });
    item(w, "c4").lessons = 30;
    const held = planOf(w);
    const inT1b = (g: string) =>
      held
        .contentLessons(g)
        .filter((l) => (l.slotKey?.split("|")[1] ?? "") <= "2026-12-22");
    expect(GROUPS.map((g) => inT1b(g).length)).toEqual([18, 18, 18]);
    expect(held.spareCount("cp:block:T1b")).toEqual({
      "13 1": 1,
      "13 3": 0,
      "13 5": 0,
    });
    expect(held.lessonAt("13 1|2026-12-21|5")).toBe("flex:13 1:cp:block:T1b#1");
  });

  test("a group that is ahead gets spare lessons until the others catch up", () => {
    // 13 5 positioned at c2#1: it has 3 more spare lessons before a1 than in the base world
    const w = paceWorld();
    const p = w.positions.find((x) => x.groupId === "13 5");
    if (p) p.nextLessonId = "c2#1";
    const ahead = planOf(w);
    expect(ahead.flexOf("13 5", "cp:a1")).toHaveLength(
      base.flexOf("13 5", "cp:a1").length + 3,
    );
    // It is held at the others' pace: c3#3 is still after the assessment.
    expect(ahead.dateIn("13 5", "c3#2") < ahead.anchorDate("13 5", "a1")).toBe(
      true,
    );
    expect(ahead.dateIn("13 5", "c3#3") > ahead.anchorDate("13 5", "a1")).toBe(
      true,
    );
    // Its spare lessons are its last three slots before the assessment.
    expect(
      ahead.flexOf("13 5", "cp:a1").map((f) => [f.lessonId, f.slotKey]),
    ).toEqual([
      ["flex:13 5:cp:a1#1", "13 5|2026-11-19|6"],
      ["flex:13 5:cp:a1#2", "13 5|2026-11-24|2"],
      ["flex:13 5:cp:a1#3", "13 5|2026-11-26|6"],
    ]);
  });

  test("an override that shortens an item for one group gives that group a spare lesson", () => {
    // override 13 3's c3 from 4 to 3: 13 3 has one more flex id than in the base world
    const w = paceWorld();
    w.overrides = [{ groupId: "13 3", itemId: "c3", lessons: 3 }];
    const short = planOf(w);
    expect(short.flexOf("13 3")).toHaveLength(base.flexOf("13 3").length + 1);
    // The window it frees is T1b; the new spare lesson is 13 3's fifth there, in its last slot of the window.
    expect(short.spareCount("cp:block:T1b")["13 3"]).toBe(5);
    expect(short.lessonAt("13 3|2026-12-22|5")).toBe(
      "flex:13 3:cp:block:T1b#5",
    );
    expect(short.flexOf("13 3", "cp:a1")).toHaveLength(1);
    // Its c4 lessons are not earlier than 13 1's pace allows: not brought before the assessment.
    expect(short.dateIn("13 3", "c4#1") > short.anchorDate("13 3", "a1")).toBe(
      true,
    );
    expect(short.lessonAt("13 3|2026-12-03|4")).toBe("c4#1");
    // The others are unchanged.
    expect(short.placementsOf("13 1")).toEqual(base.placementsOf("13 1"));
  });

  test("an item the course has no lessons of keeps its place in the scheme order for the run", () => {
    // From a pace property counterexample (seed -502150774). The course has no c3
    // lessons, but 13 1 and 13 5 each teach one by override, and 13 1 drops c4.
    // c3 still sits between c2 and c4, so the run to c4#1 takes c3#1 for both:
    // 13 5 must not have c3#1 before the assessment while 13 1 does not.
    // Slack is 2, 3 and 2; the shares of the run to c4#1 are 1, 1 and 2.
    const w = paceWorld();
    item(w, "c3").lessons = 0;
    w.overrides = [
      { groupId: "13 1", itemId: "c3", lessons: 1 },
      { groupId: "13 1", itemId: "c4", lessons: 0 },
      { groupId: "13 5", itemId: "c3", lessons: 1 },
    ];
    const plan = planOf(w);
    for (const g of ["13 1", "13 5"])
      expect(plan.dateIn(g, "c3#1") < plan.anchorDate(g, "a1"), g).toBe(true);
    for (const g of ["13 3", "13 5"])
      expect(plan.dateIn(g, "c4#1") < plan.anchorDate(g, "a1"), g).toBe(true);
    expect(plan.spareCount("cp:a1")).toEqual({
      "13 1": 1,
      "13 3": 2,
      "13 5": 0,
    });
  });
});

describe("planWindows", () => {
  const lesson = (itemId: string, index: number, of: number): Lesson => ({
    id: `${itemId}#${index}`,
    itemId,
    index,
    of,
    kind: "teaching",
  });
  const run = (itemId: string, n: number) =>
    Array.from({ length: n }, (_, i) => lesson(itemId, i + 1, n));
  const cp: Checkpoint = {
    id: "cp:t",
    kind: "assessment",
    date: "2026-11-27",
    label: "t",
    itemId: "t",
  };
  const end: Checkpoint = {
    id: "cp:block:X",
    kind: "block-end",
    date: "2026-12-22",
    label: "End of block X",
    itemId: null,
  };
  const groups = paceWorld().groups.slice(0, 2);
  const [a, b] = groups.map((g) => g.id) as [string, string];
  const slotsOf = (g: string, n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => `${g}|slot|${from + i}`);

  test("each window says what is due, what is brought forward and how many slots are spare", () => {
    const canonical = [...run("x", 2), ...run("y", 3)];
    const plans = planWindows({
      groups,
      checkpoints: [cp, end],
      streams: { [a]: canonical, [b]: canonical },
      windowSlots: (g, c) =>
        c.id === cp.id
          ? slotsOf(g, g === a ? 3 : 5)
          : slotsOf(g, 4, g === a ? 3 : 5),
      requiredBefore: (c) => new Set(c.id === cp.id ? ["x"] : []),
      canonical,
    });
    expect(plans.map((p) => p.checkpoint.id)).toEqual(["cp:t", "cp:block:X"]);
    // Slack is 1 and 3: one lesson of y comes forward for both; b has two spare slots.
    expect(plans[0]?.perGroup[a]).toEqual({
      slots: slotsOf(a, 3),
      required: ["x#1", "x#2"],
      broughtForward: ["y#1"],
      spare: 0,
      short: [],
      absorbed: [],
    });
    expect(plans[0]?.perGroup[b]).toMatchObject({
      required: ["x#1", "x#2"],
      broughtForward: ["y#1"],
      spare: 2,
    });
    // The last checkpoint wants everything left.
    expect(plans[1]?.perGroup[a]).toMatchObject({
      required: ["y#2", "y#3"],
      broughtForward: [],
      spare: 2,
    });
  });

  test("checkpoints are worked in date order, whatever order they are given in", () => {
    const canonical = [...run("x", 2), ...run("y", 3)];
    const args = {
      groups,
      streams: { [a]: canonical, [b]: canonical },
      windowSlots: (g: string, c: Checkpoint) =>
        c.id === cp.id ? slotsOf(g, 3) : slotsOf(g, 4, 3),
      requiredBefore: (c: Checkpoint) => new Set(c.id === cp.id ? ["x"] : []),
      canonical,
    };
    const given = planWindows({ ...args, checkpoints: [end, cp] });
    expect(given.map((p) => p.checkpoint.id)).toEqual(["cp:t", "cp:block:X"]);
    expect(given).toEqual(planWindows({ ...args, checkpoints: [cp, end] }));
  });

  test("a group with negative slack is short alone, and the others still bring forward what fits them (spec 10.6)", () => {
    const canonical = [...run("x", 3), ...run("y", 2)];
    const plans = planWindows({
      groups,
      checkpoints: [cp, end],
      streams: { [a]: canonical, [b]: canonical },
      windowSlots: (g, c) =>
        c.id === cp.id ? slotsOf(g, g === a ? 2 : 5) : slotsOf(g, 6, 5),
      requiredBefore: (c) => new Set(c.id === cp.id ? ["x"] : []),
      canonical,
    });
    expect(plans[0]?.perGroup[a]).toMatchObject({
      required: ["x#1", "x#2"],
      broughtForward: [],
      short: ["x#3"],
      spare: 0,
    });
    // b is not slowed by a: its slack of 2 takes y#1 and y#2.
    expect(plans[0]?.perGroup[b]).toMatchObject({
      required: ["x#1", "x#2", "x#3"],
      broughtForward: ["y#1", "y#2"],
      short: [],
      spare: 0,
    });
    // What a was short of is first in line in the next window.
    expect(plans[1]?.perGroup[a]?.required).toEqual(["x#3", "y#1", "y#2"]);
  });
});

describe("the revision block and the official exam", () => {
  test("study leave from 11 May: 13 1's last lesson is 10 May and its last four slots are revision", () => {
    const w = withStudyLeave(paceWorld());
    const plan = planOf(w);
    // 13 1's slots at the end: 26, 28, 30 Apr, 3, 5, 7, 10 May. revisionWeeks 2 = the weeks of 3 May and 10 May.
    expect(lastSlotDate(w, "13 1")).toBe("2027-05-10");
    expect(
      plan
        .contentLessons("13 1")
        .every((l) => plan.dateIn("13 1", l.id) <= "2027-04-30"),
    ).toBe(true); // no content lesson after 30 April 2027
    for (const d of ["2027-05-03", "2027-05-05", "2027-05-07", "2027-05-10"])
      expect(plan.lessonOnDate("13 1", d)).toMatch(
        /^flex:13 1:cp:revision#\d+$/,
      );
    const revision = plan.snapshot.checkpoints.find(
      (c) => c.id === "cp:revision",
    );
    expect(revision).toMatchObject({
      kind: "revision",
      label: "Before revision",
      itemId: null,
    });
    expect(revision?.perGroupDate?.["13 1"]).toBe("2027-05-03");
    // The spare lesson before the block (30 April) is not a revision lesson: it is dated before the block starts.
    expect(plan.lessonOnDate("13 1", "2027-04-30")).toMatch(/^flex:13 1:/);
    expect("2027-04-30" < (revision?.perGroupDate?.["13 1"] ?? "")).toBe(true);
  });

  test("revisionWeeks 0 turns the revision block off", () => {
    const w = withStudyLeave(paceWorld());
    w.revisionWeeks = 0;
    const plan = planOf(w);
    expect(plan.snapshot.checkpoints.some((c) => c.kind === "revision")).toBe(
      false,
    );
    for (const d of ["2027-05-03", "2027-05-05", "2027-05-07", "2027-05-10"]) {
      const id = plan.lessonOnDate("13 1", d);
      expect(id).toBeDefined();
      expect(id).not.toMatch(/cp:revision/);
    }
    // They are ordinary spare lessons of the last block.
    expect(plan.lessonOnDate("13 1", "2027-05-10")).toMatch(
      /^flex:13 1:cp:block:T3a#\d+$/,
    );
  });

  test("content that does not fit before the revision block is overflow at 'Before revision', never inside it", () => {
    const w = withStudyLeave(paceWorld());
    item(w, "c4").lessons = 400;
    const plan = planOf(w);
    const revision = plan.snapshot.checkpoints.find(
      (c) => c.id === "cp:revision",
    );
    expect(revision?.label).toBe("Before revision");
    for (const g of GROUPS) {
      const o = plan.snapshot.overflow.filter((x) => x.groupId === g);
      expect(o.map((x) => x.checkpointId)).toEqual(["cp:revision"]);
      expect(o[0]?.lessonIds.at(-1)).toBe("c4#400");
      const start = revision?.perGroupDate?.[g] ?? "";
      expect(start).not.toBe("");
      // Content runs right up to the block and never into it.
      const content = plan.contentLessons(g).map((l) => plan.dateIn(g, l.id));
      expect(content.every((d) => d < start)).toBe(true);
      const inBlock = plan
        .placementsOf(g)
        .filter(
          (p) =>
            p.slotKey !== null && (plan.dateOf(g, p.lessonId) ?? "") >= start,
        );
      expect(inBlock.length).toBeGreaterThan(0);
      expect(
        inBlock.every((p) => p.lessonId.startsWith(`flex:${g}:cp:revision#`)),
      ).toBe(true);
    }
    expect(plan.lessonOnDate("13 1", "2027-04-30")).toMatch(/^c4#/);
    expect(revision?.perGroupDate?.["13 1"]).toBe("2027-05-03");
  });

  test("with an exam, revision is counted back from the last slot before the exam, not from the end of the year", () => {
    // exams: WBS14 01 on 2027-06-01 for the three groups, no study leave: the revision weeks are the two Monday-to-Sunday weeks that end the group's last slot before 1 June
    const plan = planOf(withExam(paceWorld()));
    const revision = plan.snapshot.checkpoints.find(
      (c) => c.id === "cp:revision",
    );
    // 13 1 last slot Mon 31 May: weeks of 31 May and 24 May. 13 3 last slot Thu 27 May: weeks of 24 and 17 May.
    // 13 5 last slot Mon 31 May P6: weeks of 31 May and 24 May, first slot Tue 25 May.
    expect(revision?.perGroupDate).toEqual({
      "13 1": "2027-05-24",
      "13 3": "2027-05-18",
      "13 5": "2027-05-25",
    });
    expect(revision?.date).toBe("2027-05-18");
    for (const d of ["2027-05-24", "2027-05-26", "2027-05-28", "2027-05-31"])
      expect(plan.lessonOnDate("13 1", d)).toMatch(
        /^flex:13 1:cp:revision#\d+$/,
      );
    // Without the exam, the block is the last two weeks of the year instead.
    const noExam = planOf(paceWorld()).snapshot.checkpoints.find(
      (c) => c.id === "cp:revision",
    );
    expect(noExam?.perGroupDate?.["13 1"]).toBe("2027-06-21");
    expect(mondayOf(noExam?.perGroupDate?.["13 1"] ?? "")).toBe("2027-06-21");
  });

  test("each exam is a checkpoint named by its code, and the plan's last checkpoint is its latest exam", () => {
    const { snapshot } = planOf(withExam(paceWorld()));
    expect(snapshot.checkpoints.at(-1)).toMatchObject({
      id: "cp:exam:WBS14 01",
      kind: "exam",
      date: "2027-06-01",
      itemId: null,
    });
    expect(
      snapshot.checkpoints.some(
        (c) => c.kind === "block-end" && c.date > "2027-06-01",
      ),
    ).toBe(false);
    expect(snapshot.checkpoints.some((c) => c.id === "cp:block:T3a")).toBe(
      false,
    );
    expect(snapshot.checkpoints.some((c) => c.id.includes("x:3f2b"))).toBe(
      false,
    );
  });

  test("usable slots after a group's exam get no placement and no spare lesson", () => {
    const w = withExam(paceWorld());
    const { snapshot } = planOf(w);
    const onOrAfter = w.slots.filter(
      (s) => s.date >= "2027-06-01" && s.status === "open",
    );
    // The exam is on the morning of 1 June: 13 3 and 13 5 have slots that day, and every group has slots after it.
    expect(onOrAfter.map((s) => s.key)).toContain("13 3|2027-06-01|5");
    expect(onOrAfter.length).toBeGreaterThan(20);
    const keys = new Set(onOrAfter.map((s) => s.key));
    expect(
      snapshot.placements.filter((p) => p.slotKey && keys.has(p.slotKey)),
    ).toEqual([]);
    expect(snapshot.assessments.filter((a) => keys.has(a.slotKey))).toEqual([]);
    // The last thing each group has is revision, right before the exam.
    const last = (g: string) =>
      snapshot.placements
        .filter((p) => p.groupId === g && p.slotKey !== null)
        .sort((x, y) => ((x.slotKey ?? "") < (y.slotKey ?? "") ? -1 : 1))
        .at(-1)?.lessonId;
    for (const g of GROUPS)
      expect(last(g)).toMatch(new RegExp(`^flex:${g}:cp:revision#`));
  });

  test("with no exam rows the last block end is the last checkpoint", () => {
    const { snapshot } = planOf(paceWorld());
    expect(snapshot.checkpoints.at(-1)).toMatchObject({
      id: "cp:block:T3a",
      kind: "block-end",
      date: "2027-06-29",
    });
    expect(snapshot.checkpoints.some((c) => c.kind === "exam")).toBe(false);
  });
});
