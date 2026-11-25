import { paceWorld } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import { slotDate } from "./history.ts";
import type { LessonLogEntry, Pin, PlanInputs, PlanSnapshot } from "./plan.ts";
import {
  acceptProposal,
  diffSnapshots,
  headSnapshot,
  isUpToDate,
  type PlanChain,
  planMetrics,
  propose,
  sameExceptHistoryStates,
  snapshotKey,
  undo,
} from "./revisions.ts";
import type { SowItem } from "./scheme.ts";
import { sequence } from "./sequence.ts";

const world = paceWorld();
const first = sequence(world);
const meta = (id: string) => ({ id, createdAt: "2026-11-09T09:00:00Z" });
const cancel = (w: PlanInputs, key: string): PlanInputs => {
  const slots = w.slots.map((s) =>
    s.key === key ? { ...s, status: "cancelled" as const } : s,
  );
  return { ...w, slots };
};
const exam = (date: string) => ({
  id: "x1",
  code: "WBS14 01",
  title: "Unit 4",
  date,
  session: "morning" as const,
  durationMinutes: 120,
  groupIds: ["13 1", "13 3", "13 5"],
  source: null,
});
const onChain = (snapshot: PlanSnapshot): PlanChain => ({
  planId: "ial-business-u4",
  headId: "r1",
  revisions: {
    r1: {
      id: "r1",
      planId: "ial-business-u4",
      parentId: null,
      label: "First plan",
      createdAt: "2026-11-09T09:00:00Z",
      snapshot,
    },
  },
});
const propose2 = (inputs: PlanInputs, head: PlanSnapshot | null = first) =>
  propose({
    planId: "ial-business-u4",
    baseRevisionId: head ? "r1" : null,
    head,
    inputs,
    label: "A change",
  });

describe("the diff", () => {
  test("the first proposal has no before and lists every planned lesson as added", () => {
    const p = propose({
      planId: "ial-business-u4",
      baseRevisionId: null,
      head: null,
      inputs: world,
      label: "First plan",
    });
    expect(p.before).toBeNull();
    expect(p.candidate).toEqual(first);
    // 3 groups x 12 lessons; spare lessons are counted in the metrics, not listed.
    expect(p.diff.entries).toHaveLength(36);
    expect(p.diff.entries.every((e) => e.change === "added")).toBe(true);
    expect(p.diff.changedByGroup).toEqual({
      "13 1": 12,
      "13 3": 12,
      "13 5": 12,
    });
  });

  test("cancelling a slot moves the lessons after it and marks the one that was hit", () => {
    const { diff } = propose2(cancel(world, "13 1|2026-11-18|2"));
    expect(diff.entries.find((e) => e.lessonId === "c2#2")).toMatchObject({
      change: "moved",
      from: "13 1|2026-11-18|2",
      to: "13 1|2026-11-20|6",
      hitByDisruption: true,
    });
    expect(diff.entries[0]?.hitByDisruption).toBe(true);
    expect(diff.entries.filter((e) => e.hitByDisruption)).toHaveLength(1);
    // The groups share one pace line, so 13 3 and 13 5 move too, but only 13 1 was hit.
    expect(
      diff.entries.filter((e) => e.groupId !== "13 1").length,
    ).toBeGreaterThan(0);
    expect(
      diff.entries.every((e) => e.groupId === "13 1" || !e.hitByDisruption),
    ).toBe(true);
    // c1 lessons are before the cancelled slot and never move.
    expect(diff.entries.some((e) => e.lessonId.startsWith("c1#"))).toBe(false);
    expect(diff.changedByGroup["13 1"]).toBe(
      diff.entries.filter((e) => e.groupId === "13 1").length,
    );
  });

  test("a lesson whose slot no longer exists is hit, marked as gone, and listed first", () => {
    // a correction made 18 Nov a day without lessons: 13 1's slot that day is not there at all
    const gone = "13 1|2026-11-18|2";
    const w = { ...world, slots: world.slots.filter((s) => s.key !== gone) };
    const { entries } = propose2(w).diff;
    expect(entries[0]).toMatchObject({
      groupId: "13 1",
      lessonId: "c2#2",
      from: gone,
      hitByDisruption: true,
      slotGone: true,
    });
    expect(entries.filter((e) => e.slotGone)).toHaveLength(1);
    // a cancelled slot is still there: hit, but not gone
    const cancelled = propose2(cancel(world, gone)).diff.entries[0];
    expect(cancelled).toMatchObject({ hitByDisruption: true, slotGone: false });
  });

  test("every hit lesson is listed before every other change, whatever the dates", () => {
    // 13 3 loses a slot on 24 Nov and 13 1 one on 7 Dec. Lessons that only shift in 13 3 and
    // 13 5 in between are dated before 13 1's hit lesson, but still come after it.
    const w = cancel(cancel(world, "13 3|2026-11-24|5"), "13 1|2026-12-07|5");
    const { entries } = propose2(w).diff;
    const hits = entries.filter((e) => e.hitByDisruption);
    expect(hits.map((e) => `${e.groupId} ${e.lessonId}`)).toEqual([
      "13 3 c3#1",
      "13 1 c4#2",
    ]);
    expect(entries.slice(0, 2)).toEqual(hits);
    const lastHit = slotDate(hits[1]?.to ?? "");
    expect(
      entries.slice(2).some((e) => slotDate(e.to ?? e.from ?? "") < lastHit),
    ).toBe(true);
  });

  test("entries after the hit one are in date order", () => {
    const { entries } = propose2(cancel(world, "13 1|2026-11-18|2")).diff;
    const dates = entries.map((e) => slotDate(e.to ?? e.from ?? ""));
    expect(dates.slice(1)).toEqual([...dates.slice(1)].sort());
  });

  test("history, pinned lessons and dated assessments never appear in a diff", () => {
    // history: a week later c1 lessons are assumed, and that is not a change.
    const later = propose2({ ...world, today: "2026-11-16" });
    const lessons = later.diff.entries.map((e) => e.lessonId);
    expect(lessons).not.toContain("c1#1");
    expect(
      later.candidate.placements.find((p) => p.lessonId === "c1#1"),
    ).toMatchObject({
      state: "assumed",
    });

    // pinned: a lesson pinned to one slot and then pinned to another is not listed.
    const pin = (slotKey: string): Pin => ({
      id: "p1",
      groupId: "13 1",
      lessonId: "c3#3",
      kind: "slot",
      slotKey,
    });
    const pinnedFirst = sequence({
      ...world,
      pins: [pin("13 1|2026-12-09|2")],
    });
    const repinned = propose2(
      { ...world, pins: [pin("13 1|2026-12-11|6")] },
      pinnedFirst,
    );
    const c33 = (s: PlanSnapshot) =>
      s.placements.find((p) => p.groupId === "13 1" && p.lessonId === "c3#3");
    expect(c33(pinnedFirst)).toMatchObject({
      slotKey: "13 1|2026-12-09|2",
      pinned: true,
    });
    expect(c33(repinned.candidate)).toMatchObject({
      slotKey: "13 1|2026-12-11|6",
      pinned: true,
    });
    expect(repinned.diff.entries.some((e) => e.lessonId === "c3#3")).toBe(
      false,
    );

    // dated assessment: cancelling a1's slot moves it, and the diff lists lessons only.
    const hit = propose2(cancel(world, "13 1|2026-11-27|6"));
    const a1 = (s: PlanSnapshot) =>
      s.assessments.find((a) => a.groupId === "13 1");
    expect(a1(hit.candidate)?.slotKey).not.toBe(a1(first)?.slotKey);
    expect(hit.diff.entries.some((e) => e.lessonId === "a1")).toBe(false);
    expect(hit.diff.entries.every((e) => !e.lessonId.startsWith("flex:"))).toBe(
      true,
    );
  });

  test("a past lesson later logged as skipped appears as a correction", () => {
    const log: LessonLogEntry[] = [
      {
        seq: 1,
        groupId: "13 1",
        lessonId: "c1#3",
        slotKey: "13 1|2026-11-13|6",
        outcome: "skipped",
        recordedOn: "2026-11-20",
        note: null,
      },
    ];
    const { diff } = propose2({ ...world, today: "2026-11-20", log });
    const entry = diff.entries.find((e) => e.lessonId === "c1#3");
    expect(entry).toMatchObject({
      groupId: "13 1",
      change: "correction",
      from: "13 1|2026-11-13|6",
      to: "13 1|2026-11-25|2",
      fromState: "planned",
      toState: "skipped",
      hitByDisruption: false,
    });
    expect(diff.entries.filter((e) => e.lessonId === "c1#3")).toHaveLength(1);
    // c1#1 and c1#2 were only assumed: history, not listed.
    expect(diff.entries.some((e) => e.lessonId === "c1#1")).toBe(false);
  });

  test("a lesson count cut shows the lessons that left the plan as removed", () => {
    const items = world.items.map((i) =>
      i.id === "c4" ? { ...i, lessons: 0 } : i,
    );
    const { diff } = propose2({ ...world, items });
    const removed = diff.entries.filter((e) => e.change === "removed");
    expect(removed.map((e) => `${e.groupId} ${e.lessonId}`).sort()).toEqual(
      ["13 1", "13 3", "13 5"]
        .flatMap((g) => [`${g} c4#1`, `${g} c4#2`])
        .sort(),
    );
    expect(removed[0]).toMatchObject({ to: null, toState: null });
    expect(removed[0]?.from).not.toBeNull();
  });

  test("a lesson she took back from skipped is listed as state, and an assumed one that is now skipped as a correction", () => {
    const after: PlanSnapshot = {
      ...first,
      placements: first.placements.map((p) =>
        p.groupId === "13 1" && p.lessonId === "c3#1"
          ? { ...p, state: "assumed" }
          : p,
      ),
    };
    const before: PlanSnapshot = {
      ...first,
      placements: first.placements.map((p) =>
        p.groupId === "13 1" && p.lessonId === "c3#1"
          ? { ...p, state: "skipped" }
          : p,
      ),
    };
    // history that is now skipped is a correction; it is the only history change listed
    const live = diffSnapshots(after, before, world.slots);
    expect(live.entries).toHaveLength(1);
    expect(live.entries[0]).toMatchObject({
      change: "correction",
      from: "13 1|2026-11-23|5",
      fromState: "assumed",
      toState: "skipped",
    });
    const reversed = diffSnapshots(before, first, world.slots);
    expect(reversed.entries).toHaveLength(1);
    expect(reversed.entries[0]).toMatchObject({
      change: "state",
      fromState: "skipped",
      toState: "planned",
    });
  });

  test("an earlier answer she changes (skipped to taught) is a correction, and confirming an assumed lesson is not a change", () => {
    const slotKey = "13 1|2026-11-23|5";
    const withState = (state: "skipped" | "taught"): PlanSnapshot => ({
      ...first,
      placements: first.placements.map((p) =>
        p.groupId === "13 1" && p.lessonId === "c3#1" ? { ...p, state } : p,
      ),
    });
    const diff = diffSnapshots(
      withState("skipped"),
      withState("taught"),
      world.slots,
    );
    expect(diff.entries).toHaveLength(1);
    expect(diff.entries[0]).toMatchObject({
      groupId: "13 1",
      lessonId: "c3#1",
      change: "correction",
      from: slotKey,
      fromState: "skipped",
      toState: "taught",
    });
    // a confirmation of what was only assumed is not a change to the plan
    expect(
      diffSnapshots(
        {
          ...first,
          placements: first.placements.map((p) =>
            p.groupId === "13 1" && p.lessonId === "c3#1"
              ? { ...p, state: "assumed" }
              : p,
          ),
        },
        withState("taught"),
        world.slots,
      ).entries,
    ).toEqual([]);
  });

  test("identical snapshots give an empty diff", () =>
    expect(diffSnapshots(first, first, world.slots).entries).toEqual([]));
});

describe("the metrics", () => {
  test("metrics count placed and overflow per group, and say when the last content lesson is", () =>
    // `spare` is a whole-year count here (82 slots from 9 Nov, minus 12 lessons and 1 assessment, is 69 for 13 3 at HEAD), so it is not asserted
    expect(planMetrics(first, world.slots).perGroup["13 3"]).toMatchObject({
      placed: 12,
      overflow: 0,
      lastContentDate: "2026-12-10",
    }));

  test("spare counts the spare lessons of the whole plan", () => {
    const spare = first.placements.filter(
      (p) => p.groupId === "13 3" && p.lessonId.startsWith("flex:"),
    ).length;
    expect(spare).toBeGreaterThan(5);
    expect(planMetrics(first, world.slots).perGroup["13 3"]?.spare).toBe(spare);
  });

  test("13 3 has 5 spare lessons dated before 23 December 2026", () => {
    const spare = first.placements.filter(
      (p) =>
        p.groupId === "13 3" &&
        p.lessonId.startsWith("flex:") &&
        slotDate(p.slotKey ?? "") < "2026-12-23",
    );
    expect(spare).toHaveLength(5);
    expect(spare.map((p) => p.slotKey).sort()).toEqual([
      "13 3|2026-11-26|4",
      "13 3|2026-12-15|5",
      "13 3|2026-12-17|3",
      "13 3|2026-12-17|4",
      "13 3|2026-12-22|5",
    ]);
  });

  test("the official exam is in the metrics", () => {
    const withExam = sequence({ ...world, exams: [exam("2027-06-01")] });
    expect(
      planMetrics(withExam, world.slots).perGroup["13 3"]?.officialExam,
    ).toEqual({
      code: "WBS14 01",
      date: "2027-06-01",
    });
    expect(
      planMetrics(first, world.slots).perGroup["13 3"]?.officialExam,
    ).toBeNull();
  });

  test("lessons after the official exam are counted for the proposal summary", () => {
    // An exam on 3 Dec: 13 3 has no lesson from that day, and its revision block (the last
    // two weeks before it, 24 and 26 Nov) takes 3 spare lessons. c1 and c2 fit before
    // that; c3 and c4 (6 lessons) are never placed, so they are the lessons after the exam.
    const early = propose2({ ...world, exams: [exam("2026-12-03")] }, null);
    const g = early.after.perGroup["13 3"];
    expect(g).toMatchObject({
      placed: 6,
      overflow: 6,
      officialExam: { code: "WBS14 01", date: "2026-12-03" },
    });
    expect(g ? g.placed + g.overflow : 0).toBe(12);
  });

  test("overflow counts a lesson once, however many checkpoints list it", () => {
    const listed: PlanSnapshot = {
      ...first,
      placements: first.placements.filter(
        (p) => !(p.groupId === "13 3" && p.lessonId === "c4#2"),
      ),
      overflow: [
        { checkpointId: "cp:a1", groupId: "13 3", lessonIds: ["c4#2", "c3#1"] },
        { checkpointId: "cp:block:T1b", groupId: "13 3", lessonIds: ["c4#2"] },
      ],
    };
    // c3#1 is listed late but is placed; c4#2 is listed twice and is never placed.
    expect(planMetrics(listed, world.slots).perGroup["13 3"]).toMatchObject({
      placed: 11,
      overflow: 1,
    });
  });

  test("a skipped lesson that was not placed again is not placed", () => {
    const s: PlanSnapshot = {
      ...first,
      placements: first.placements.map((p) =>
        p.groupId === "13 3" && p.lessonId === "c1#1"
          ? { ...p, state: "skipped" }
          : p,
      ),
      overflow: [
        { checkpointId: "cp:a1", groupId: "13 3", lessonIds: ["c1#1"] },
      ],
    };
    expect(planMetrics(s, world.slots).perGroup["13 3"]).toMatchObject({
      placed: 11,
      overflow: 1,
    });
  });
});

describe("same except history states", () => {
  const later = sequence({ ...world, today: "2026-11-16", previous: first });
  test("sameExceptHistoryStates ignores a history state change and nothing else", () => {
    const changed = (
      fn: (p: PlanSnapshot["placements"][number]) => object,
    ) => ({
      ...later,
      placements: later.placements.map((p) => ({ ...p, ...fn(p) })),
    });
    const isC11 = (p: { groupId: string; lessonId: string }) =>
      p.groupId === "13 1" && p.lessonId === "c1#1";
    expect(later.placements.find(isC11)?.state).toBe("assumed");
    const taught = changed((p) => (isC11(p) ? { state: "taught" } : {}));
    expect(taught.placements.find(isC11)?.state).toBe("taught");
    expect(sameExceptHistoryStates(later, taught)).toBe(true);
    expect(snapshotKey(later)).not.toBe(snapshotKey(taught));

    const moved = changed((p) =>
      p.groupId === "13 1" && p.lessonId === "c3#1"
        ? { slotKey: "13 1|2026-12-21|5" }
        : {},
    );
    expect(sameExceptHistoryStates(later, moved)).toBe(false);
    const planned = changed((p) =>
      p.groupId === "13 1" && p.lessonId === "c3#1" ? { state: "assumed" } : {},
    );
    // a lesson that was still ahead of her becoming history is a real change
    expect(sameExceptHistoryStates(later, planned)).toBe(false);
    const todayChanged = { ...later, today: "2026-11-17" };
    expect(sameExceptHistoryStates(later, todayChanged)).toBe(false);
  });
});

describe("a skip is a real change", () => {
  test("sameExceptHistoryStates sees a lone skip: skipped is not just another history state", () => {
    const later = sequence({ ...world, today: "2026-11-16", previous: first });
    const isC11 = (p: { groupId: string; lessonId: string }) =>
      p.groupId === "13 1" && p.lessonId === "c1#1";
    expect(later.placements.find(isC11)?.state).toBe("assumed");
    const skipped = {
      ...later,
      placements: later.placements.map((p) =>
        isC11(p) ? { ...p, state: "skipped" as const } : p,
      ),
    };
    expect(sameExceptHistoryStates(later, skipped)).toBe(false);
    expect(sameExceptHistoryStates(skipped, later)).toBe(false);
    // and the other history states still count as the same
    const cover = {
      ...later,
      placements: later.placements.map((p) =>
        isC11(p) ? { ...p, state: "cover" as const } : p,
      ),
    };
    expect(sameExceptHistoryStates(later, cover)).toBe(true);
  });
});

describe("is the plan up to date", () => {
  const at = (today: string, over: Partial<PlanInputs> = {}) =>
    sequence({ ...world, today, previous: first, ...over });
  const check = (fresh: PlanSnapshot, slots = world.slots) =>
    isUpToDate({ head: first, fresh, slots, flexEdits: [] });
  const c11 = first.placements.find(
    (p) => p.groupId === "13 1" && p.lessonId === "c1#1",
  );

  test("a week later with nothing changed it is up to date: lessons in the past are only assumed", () => {
    expect(check(at("2026-11-16"))).toBe(true);
  });

  test("after the assessment date, with it marked sat, past spare lessons and checkpoints are not changes", () => {
    const items = world.items.map((i) =>
      i.assessment
        ? { ...i, assessment: { ...i.assessment, status: "sat" as const } }
        : i,
    );
    // every group has sat a1 by 2 Dec (13 3 on 1 Dec), and 13 3's spare lesson on
    // 26 Nov is in the past, so a new plan drops it
    expect(
      first.placements.some(
        (p) =>
          p.lessonId.startsWith("flex:13 3:cp:a1") &&
          slotDate(p.slotKey ?? "") < "2026-12-02",
      ),
    ).toBe(true);
    expect(check(at("2026-12-02", { items }))).toBe(true);
    // still planned, the past assessment is a conflict: she has not said it was sat
    expect(check(at("2026-12-02"))).toBe(false);
  });

  test("a lesson logged as taught or cover keeps it up to date", () => {
    const log = (outcome: LessonLogEntry["outcome"]): LessonLogEntry[] => [
      {
        seq: 1,
        groupId: "13 1",
        lessonId: "c1#1",
        slotKey: c11?.slotKey ?? null,
        outcome,
        recordedOn: "2026-11-16",
        note: null,
      },
    ];
    expect(check(at("2026-11-16", { log: log("taught") }))).toBe(true);
    expect(check(at("2026-11-16", { log: log("cover") }))).toBe(true);
  });

  test("a lone skip makes it out of date", () => {
    const log: LessonLogEntry[] = [
      {
        seq: 1,
        groupId: "13 1",
        lessonId: "c1#1",
        slotKey: c11?.slotKey ?? null,
        outcome: "skipped",
        recordedOn: "2026-11-16",
        note: null,
      },
    ];
    expect(check(at("2026-11-16", { log }))).toBe(false);
  });

  test("a head lesson on a slot that is no longer usable makes it out of date, even before a new plan moves it", () => {
    const fresh = at("2026-11-16");
    const ahead = first.placements.find(
      (p) => p.groupId === "13 1" && p.lessonId === "c3#1",
    );
    const cancelled = cancel(world, ahead?.slotKey ?? "");
    expect(check(fresh, cancelled.slots)).toBe(false);
    expect(
      check(at("2026-11-16", { slots: cancelled.slots }), cancelled.slots),
    ).toBe(false);
  });

  test("conflicts and absorbed buffer lessons are seen as of today: a missed deadline on a lesson now behind her is not a change", () => {
    // c3#1 must be taught by 10 Nov and is planned for 23 Nov: a not-after-missed conflict
    const pinned: PlanInputs = {
      ...world,
      pins: [
        {
          id: "na",
          groupId: "13 1",
          lessonId: "c3#1",
          kind: "not-after",
          date: "2026-11-10",
        },
      ],
    };
    const head = sequence(pinned);
    expect(head.conflicts).toEqual([
      expect.objectContaining({
        kind: "not-after-missed",
        lessonId: "c3#1",
        plannedDate: "2026-11-23",
      }),
    ]);
    const items = world.items.map((i) =>
      i.assessment
        ? { ...i, assessment: { ...i.assessment, status: "sat" as const } }
        : i,
    );
    // by 2 Dec c3#1 is in the past: a new plan says nothing about its deadline
    const fresh = sequence({
      ...pinned,
      items,
      today: "2026-12-02",
      previous: head,
    });
    expect(fresh.conflicts).toEqual([]);
    const ok = (h: PlanSnapshot, f: PlanSnapshot) =>
      isUpToDate({ head: h, fresh: f, slots: world.slots, flexEdits: [] });
    expect(ok(head, fresh)).toBe(true);
    // before the lesson, the deadline is still missed, and the conflict is the same in both
    const before = sequence({ ...pinned, today: "2026-11-16", previous: head });
    expect(before.conflicts).toEqual(head.conflicts);
    expect(ok(head, before)).toBe(true);

    // buffer lessons dropped before a checkpoint that is still ahead stay dropped a week later
    const withBuffer: PlanInputs = {
      ...world,
      items: [
        ...world.items,
        {
          ...(world.items.find((i) => i.id === "c2") as SowItem),
          id: "b1",
          kind: "buffer",
          order: 2.5,
          lessons: 4,
          title: "b1",
        },
      ],
    };
    const bufferHead = sequence(withBuffer);
    expect(bufferHead.absorbed.length).toBeGreaterThan(0);
    const weekLater = sequence({
      ...withBuffer,
      today: "2026-11-16",
      previous: bufferHead,
    });
    expect(weekLater.absorbed).toEqual(bufferHead.absorbed);
    expect(ok(bufferHead, weekLater)).toBe(true);
  });
});

describe("accept and undo", () => {
  test("accept sets the head and keeps the parent", () => {
    const chain = onChain(first);
    const p = propose2(cancel(world, "13 1|2026-11-18|2"));
    const out = acceptProposal(chain, p, meta("r2"));
    if (!out.ok) throw new Error("refused");
    expect(out.chain.headId).toBe("r2");
    expect(out.chain.revisions.r2).toMatchObject({
      id: "r2",
      planId: "ial-business-u4",
      parentId: "r1",
      label: "A change",
      createdAt: "2026-11-09T09:00:00Z",
    });
    expect(out.chain.revisions.r1).toBe(chain.revisions.r1);
    expect(headSnapshot(out.chain)).toEqual(p.candidate);
    expect(chain.headId).toBe("r1");
    expect(Object.keys(chain.revisions)).toEqual(["r1"]);
  });

  test("the first proposal on an empty chain is accepted", () => {
    const empty: PlanChain = {
      planId: "ial-business-u4",
      headId: null,
      revisions: {},
    };
    const out = acceptProposal(empty, propose2(world, null), meta("r1"));
    if (!out.ok) throw new Error("refused");
    expect(out.chain.revisions.r1?.parentId).toBeNull();
    expect(headSnapshot(out.chain)).toEqual(first);
    expect(headSnapshot(empty)).toBeNull();
  });

  test("accepting a proposal based on an older head is refused", () => {
    const old = propose2(cancel(world, "13 1|2026-11-18|2"));
    const accepted = acceptProposal(onChain(first), old, meta("r2"));
    if (!accepted.ok) throw new Error("refused");
    const chainWithNewerHead = accepted.chain;
    expect(acceptProposal(chainWithNewerHead, old, meta("r3"))).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(
      acceptProposal(chainWithNewerHead, propose2(world, null), meta("r3")),
    ).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  test("undo returns to the parent and keeps the undone revision in the chain", () => {
    const p = propose2(cancel(world, "13 1|2026-11-18|2"));
    const accepted = acceptProposal(onChain(first), p, meta("r2"));
    if (!accepted.ok) throw new Error("refused");
    const undone = undo(accepted.chain);
    if (!undone.ok) throw new Error("refused");
    expect(undone.chain.headId).toBe("r1");
    expect(headSnapshot(undone.chain)).toEqual(first);
    expect(undone.chain.revisions.r2).toEqual(accepted.chain.revisions.r2);
    // a new proposal on the restored head is accepted, and branches from r1
    const again = acceptProposal(undone.chain, propose2(world), meta("r3"));
    if (!again.ok) throw new Error("refused");
    expect(again.chain.revisions.r3?.parentId).toBe("r1");
  });

  test("undo with one revision or none says there is nothing to undo", () => {
    expect(undo(onChain(first))).toEqual({
      ok: false,
      reason: "nothing-to-undo",
    });
    expect(undo({ planId: "p", headId: null, revisions: {} })).toEqual({
      ok: false,
      reason: "nothing-to-undo",
    });
  });
});

describe("snapshotKey", () => {
  test("key order does not matter and a changed value does", () => {
    const reordered = JSON.parse(
      JSON.stringify(first, (_k, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ),
    );
    expect(snapshotKey(reordered)).toBe(snapshotKey(first));
    const changed = { ...first, today: "2026-11-10" };
    expect(snapshotKey(changed)).not.toBe(snapshotKey(first));
    const swapped = { ...first, placements: [...first.placements].reverse() };
    expect(snapshotKey(swapped)).not.toBe(snapshotKey(first));
  });
});
