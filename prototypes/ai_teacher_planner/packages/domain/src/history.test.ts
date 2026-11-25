import { paceWorld } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import {
  delivered,
  freezeHorizonEnd,
  isHistory,
  nextLesson,
  slotDate,
} from "./history.ts";
import type {
  LessonLogEntry,
  Placement,
  PlacementState,
  PlanInputs,
  PlanSnapshot,
} from "./plan.ts";
import { isUpToDate } from "./revisions.ts";
import { sequence } from "./sequence.ts";

const world = (): PlanInputs => paceWorld();
const first = sequence(world());
const later = (today: string, patch: Partial<PlanInputs> = {}): PlanInputs => ({
  ...world(),
  today,
  previous: first,
  ...patch,
});
const placementsOf = (s: PlanSnapshot, group: string, lesson: string) =>
  s.placements.filter((p) => p.groupId === group && p.lessonId === lesson);
const stateOf = (s: PlanSnapshot, group: string, lesson: string) =>
  placementsOf(s, group, lesson).map((p) => p.state);
const dateOf = (s: PlanSnapshot, group: string, lesson: string) =>
  placementsOf(s, group, lesson)
    .filter((p) => p.state === "planned")
    .map((p) => (p.slotKey ? slotDate(p.slotKey) : null));
const keyOf = (s: PlanSnapshot, group: string, lesson: string) =>
  placementsOf(s, group, lesson).map((p) => p.slotKey);
const entry = (
  groupId: string,
  lessonId: string,
  outcome: LessonLogEntry["outcome"],
  slotKey: string | null,
  recordedOn = "2026-11-16",
): LessonLogEntry => ({
  groupId,
  lessonId,
  slotKey,
  outcome,
  recordedOn,
  note: null,
});
const onDates = (s: PlanSnapshot, dates: string[]) =>
  s.placements.filter((p) => p.slotKey && dates.includes(slotDate(p.slotKey)));

describe("the helpers", () => {
  test("isHistory is true for declared, assumed, taught, cover, homework and skipped only", () => {
    const states: PlacementState[] = [
      "declared",
      "assumed",
      "taught",
      "cover",
      "homework",
      "skipped",
      "planned",
    ];
    const answers = states.map((state) =>
      isHistory({
        groupId: "g",
        lessonId: "l",
        slotKey: null,
        state,
        pinned: false,
        mergedInto: null,
        viaCover: false,
      } satisfies Placement),
    );
    expect(answers).toEqual([true, true, true, true, true, true, false]);
  });

  test("delivered counts declared, assumed, taught, cover and homework, never skipped or planned", () => {
    const base = first.placements[0] as Placement;
    const snap: PlanSnapshot = {
      ...first,
      placements: (
        [
          "declared",
          "assumed",
          "taught",
          "cover",
          "homework",
          "skipped",
          "planned",
        ] as const
      ).map((state, i) => ({
        ...base,
        groupId: "13 1",
        lessonId: `x#${i}`,
        state,
      })),
    };
    expect([...delivered(snap, "13 1")].sort()).toEqual([
      "x#0",
      "x#1",
      "x#2",
      "x#3",
      "x#4",
    ]);
    expect(delivered(snap, "13 3").size).toBe(0);
  });

  test("the freeze horizon is the next date after today with a usable slot in the plan", () => {
    const slots = world().slots;
    expect(freezeHorizonEnd("2026-11-16", slots)).toBe("2026-11-17");
    // A day with no lessons at all: the next day with one.
    expect(freezeHorizonEnd("2026-11-14", slots)).toBe("2026-11-16");
    // Cancelled slots do not count; cover slots do.
    const cancelled = slots.map((s) =>
      s.date === "2026-11-17" ? { ...s, status: "cancelled" as const } : s,
    );
    expect(freezeHorizonEnd("2026-11-16", cancelled)).toBe("2026-11-18");
    const cover = slots.map((s) =>
      s.date === "2026-11-17" ? { ...s, status: "cover" as const } : s,
    );
    expect(freezeHorizonEnd("2026-11-16", cover)).toBe("2026-11-17");
    expect(freezeHorizonEnd("2027-12-31", slots)).toBeNull();
  });

  test("slotDate reads the date out of a slot key", () =>
    expect(slotDate("13 1|2026-11-09|5")).toBe("2026-11-09"));
});

describe("history carried forward", () => {
  test("a week later, unanswered lessons are assumed and the plan carries on from the next one", () => {
    const s = sequence(later("2026-11-16"));
    expect(stateOf(s, "13 1", "c1#1")).toEqual(["assumed"]);
    expect(stateOf(s, "13 1", "c1#2")).toEqual(["assumed"]);
    expect(stateOf(s, "13 1", "c1#3")).toEqual(["assumed"]);
    expect(dateOf(s, "13 1", "c2#1")).toEqual(["2026-11-16"]);
    // History is copied unchanged apart from its state.
    const before = placementsOf(first, "13 1", "c1#1")[0] as Placement;
    expect(placementsOf(s, "13 1", "c1#1")[0]).toEqual({
      ...before,
      state: "assumed",
    });
    expect(before.slotKey).toBe("13 1|2026-11-09|5");
  });

  test("a logged outcome replaces assumed", () => {
    const s = sequence(
      later("2026-11-16", {
        log: [
          entry("13 1", "c1#1", "taught", "13 1|2026-11-09|5"),
          entry("13 1", "c1#2", "cover", "13 1|2026-11-11|2"),
        ],
      }),
    );
    expect(stateOf(s, "13 1", "c1#1")).toEqual(["taught"]);
    expect(stateOf(s, "13 1", "c1#2")).toEqual(["cover"]);
    expect(stateOf(s, "13 1", "c1#3")).toEqual(["assumed"]);
    // Another group's lesson of the same id is not touched.
    expect(stateOf(s, "13 3", "c1#1")).toEqual(["assumed"]);
  });

  test("when she answers the same lesson twice, the later entry wins, even on the same day", () => {
    const slot = "13 1|2026-11-09|5";
    // the log is oldest first: "skipped" and then "actually taught", both recorded on the 16th
    const corrected = sequence(
      later("2026-11-16", {
        log: [
          entry("13 1", "c1#1", "skipped", slot),
          entry("13 1", "c1#1", "taught", slot),
        ],
      }),
    );
    expect(stateOf(corrected, "13 1", "c1#1")).toEqual(["taught"]);
    expect(delivered(corrected, "13 1").has("c1#1")).toBe(true);
    // the other way round: taught, then "actually that one was skipped"
    const changed = sequence(
      later("2026-11-16", {
        log: [
          entry("13 1", "c1#1", "taught", slot),
          entry("13 1", "c1#1", "skipped", slot),
        ],
      }),
    );
    expect(stateOf(changed, "13 1", "c1#1")).toEqual(["skipped", "planned"]);
    expect(delivered(changed, "13 1").has("c1#1")).toBe(false);
  });

  test("an answer recorded on a later day replaces a stored state carried from an older plan", () => {
    const slot = "13 1|2026-11-09|5";
    const skip = [entry("13 1", "c1#1", "skipped", slot, "2026-11-16")];
    // a plan was accepted with the skip: the skip is now in its history
    const withSkip = sequence(later("2026-11-16", { log: skip }));
    expect(placementsOf(withSkip, "13 1", "c1#1")[0]?.state).toBe("skipped");
    const next = sequence({
      ...world(),
      today: "2026-11-23",
      previous: withSkip,
      log: [...skip, entry("13 1", "c1#1", "taught", slot, "2026-11-20")],
    });
    const states = placementsOf(next, "13 1", "c1#1").map((p) => p.state);
    // the original slot is taught now, and the lesson is not planned a third time
    expect(states[0]).toBe("taught");
    expect(states).not.toContain("planned");
    expect(states).not.toContain("skipped");
    expect(delivered(next, "13 1").has("c1#1")).toBe(true);
  });

  test("a log entry with no slot applies to the lesson's placement that came before it", () => {
    const s = sequence(
      later("2026-11-16", {
        log: [entry("13 1", "c1#2", "cover", null, "2026-11-12")],
      }),
    );
    expect(stateOf(s, "13 1", "c1#2")).toEqual(["cover"]);
  });

  test("homework or taught for a lesson that was never placed adds a history placement from the entry", () => {
    const previous: PlanSnapshot = {
      ...first,
      placements: first.placements.filter(
        (p) => !(p.groupId === "13 1" && p.lessonId === "c1#3"),
      ),
    };
    const s = sequence(
      later("2026-11-16", {
        previous,
        log: [entry("13 1", "c1#3", "homework", "13 1|2026-11-13|6")],
      }),
    );
    expect(placementsOf(s, "13 1", "c1#3")).toEqual([
      {
        groupId: "13 1",
        lessonId: "c1#3",
        slotKey: "13 1|2026-11-13|6",
        state: "homework",
        pinned: false,
        mergedInto: null,
        viaCover: false,
      },
    ]);
    expect(delivered(s, "13 1").has("c1#3")).toBe(true);
  });

  test("a skipped lesson is taught next, and the skip stays in history", () => {
    const s = sequence(
      later("2026-11-16", {
        log: [entry("13 1", "c1#3", "skipped", "13 1|2026-11-13|6")],
      }),
    );
    expect(freezeHorizonEnd("2026-11-16", world().slots)).toBe("2026-11-17");
    // The skip stays, on 13 Nov; the lesson is planned again on 18 Nov, the
    // first slot after the horizon, because c2#1 on 16 Nov is frozen.
    expect(
      placementsOf(s, "13 1", "c1#3").map((p) => [p.state, p.slotKey]),
    ).toEqual([
      ["skipped", "13 1|2026-11-13|6"],
      ["planned", "13 1|2026-11-18|2"],
    ]);
    expect(dateOf(s, "13 1", "c2#1")).toEqual(["2026-11-16"]);
    expect(delivered(s, "13 1").has("c1#3")).toBe(false);
  });

  test("a skip is not applied again to the replanned lesson at the next replan", () => {
    const log = [entry("13 1", "c1#3", "skipped", "13 1|2026-11-13|6")];
    const mid = sequence(later("2026-11-16", { log }));
    const s = sequence({
      ...world(),
      today: "2026-11-23",
      previous: mid,
      log,
    });
    expect(
      placementsOf(s, "13 1", "c1#3").map((p) => [p.state, p.slotKey]),
    ).toEqual([
      ["skipped", "13 1|2026-11-13|6"],
      ["assumed", "13 1|2026-11-18|2"],
    ]);
    expect(delivered(s, "13 1").has("c1#3")).toBe(true);
  });
});

describe("the freeze horizon", () => {
  test("today and the next teaching day do not move when the scheme changes", () => {
    const w = later("2026-11-16");
    w.items = w.items.map((i) => (i.id === "c2" ? { ...i, lessons: 1 } : i));
    const s = sequence(w);
    const dates = ["2026-11-16", "2026-11-17"];
    const frozen = onDates(first, dates);
    expect(frozen.map((p) => [p.groupId, p.lessonId])).toEqual([
      ["13 1", "c2#1"],
      ["13 3", "c2#1"],
      ["13 5", "c2#1"],
      ["13 5", "c2#2"],
    ]);
    expect(onDates(s, dates)).toEqual(frozen);
    // After the horizon the cut shows: 13 1's 18 Nov slot now holds c3#1.
    expect(
      s.placements.find((p) => p.slotKey === "13 1|2026-11-18|2")?.lessonId,
    ).toBe("c3#1");
  });

  test("a frozen lesson whose slot was cancelled is released", () => {
    const w = later("2026-11-16");
    const slot = w.slots.find((x) => x.key === "13 3|2026-11-17|5");
    if (!slot) throw new Error("no slot");
    slot.status = "cancelled";
    const s = sequence(w);
    expect(keyOf(s, "13 3", "c2#1")).toEqual(["13 3|2026-11-19|3"]);
    expect(s.placements.some((p) => p.slotKey === "13 3|2026-11-17|5")).toBe(
      false,
    );
    // The other groups' frozen lessons stay put.
    expect(keyOf(s, "13 5", "c2#2")).toEqual(["13 5|2026-11-17|1"]);
  });

  test("a pin that would move a frozen lesson is reported, and the lesson stays", () => {
    const w = later("2026-11-16", {
      pins: [
        {
          id: "p1",
          groupId: "13 1",
          lessonId: "c2#1",
          kind: "slot",
          slotKey: "13 1|2026-11-18|2",
        },
      ],
    });
    const s = sequence(w);
    expect(keyOf(s, "13 1", "c2#1")).toEqual(["13 1|2026-11-16|5"]);
    expect(s.conflicts).toContainEqual({
      kind: "pin-frozen",
      pinId: "p1",
      groupId: "13 1",
      lessonId: "c2#1",
      slotKey: "13 1|2026-11-18|2",
    });
  });
});

describe("a long gap", () => {
  test("three weeks without opening the app", () => {
    const s = sequence(later("2026-11-30"));
    expect(s.placements.filter((p) => p.state === "assumed").length).toBe(24);
    expect(new Set(s.placements.map((p) => p.groupId + p.lessonId)).size).toBe(
      s.placements.length,
    );
    for (const g of ["13 1", "13 3", "13 5"])
      expect(nextLesson(s, g)).toBe("c3#3");
    // Nothing is planned in the past.
    for (const p of s.placements)
      if (p.state === "planned" && p.slotKey)
        expect(slotDate(p.slotKey) >= "2026-11-30").toBe(true);
  });

  test("cutting a count below what was taught keeps the history and plans nothing twice", () => {
    const w = later("2026-11-23");
    w.items = w.items.map((i) => (i.id === "c1" ? { ...i, lessons: 1 } : i));
    const s = sequence(w);
    for (const id of ["c1#1", "c1#2", "c1#3"])
      expect(placementsOf(s, "13 1", id).map((p) => p.state)).toEqual([
        "assumed",
      ]);
    expect(keyOf(s, "13 1", "c1#3")).toEqual(["13 1|2026-11-13|6"]);
    expect(delivered(s, "13 1").has("c1#3")).toBe(true);
    // c3#1 is today's lesson (frozen); the stream carries on from c3#2.
    expect(nextLesson(s, "13 1")).toBe("c3#1");
    expect(keyOf(s, "13 1", "c3#2")).toEqual(["13 1|2026-11-25|2"]);
    const lessonPlacements = s.placements.filter(
      (p) => p.groupId === "13 1" && !p.lessonId.startsWith("flex:"),
    );
    expect(new Set(lessonPlacements.map((p) => p.lessonId)).size).toBe(
      lessonPlacements.length,
    );
  });
});

describe("past spare lessons", () => {
  const spare = "flex:13 3:cp:a1#1";
  test("a past spare lesson is dropped, unless she edited it", () => {
    expect(keyOf(first, "13 3", spare)).toEqual(["13 3|2026-11-26|4"]);
    const dropped = sequence(later("2026-12-01"));
    expect(
      dropped.placements.some(
        (p) => p.groupId === "13 3" && p.lessonId.startsWith("flex:13 3:cp:a1"),
      ),
    ).toBe(false);
    expect(
      dropped.placements.some((p) => p.slotKey === "13 3|2026-11-26|4"),
    ).toBe(false);
    expect(delivered(dropped, "13 3").has(spare)).toBe(false);
    const kept = sequence(
      later("2026-12-01", {
        flexEdits: [
          { flexId: spare, title: "Past paper", purpose: "exam-practice" },
        ],
      }),
    );
    expect(placementsOf(kept, "13 3", spare)).toEqual([
      {
        ...(placementsOf(first, "13 3", spare)[0] as Placement),
        state: "assumed",
      },
    ]);
    expect(delivered(kept, "13 3").has(spare)).toBe(true);
  });

  test("a spare lesson she edited stays through a later replan, edit or no edit", () => {
    const edits = [
      { flexId: spare, title: "Past paper", purpose: "exam-practice" as const },
    ];
    const mid = sequence(later("2026-12-01", { flexEdits: edits }));
    const s = sequence({ ...world(), today: "2026-12-08", previous: mid });
    expect(stateOf(s, "13 3", spare)).toEqual(["assumed"]);
  });

  test("a new spare lesson never takes the id of one kept in history", () => {
    // Two spare lessons planned before 11 Dec's block end; the first, past, is kept.
    const w = later("2026-12-01", {
      flexEdits: [{ flexId: spare, title: null, purpose: "support" }],
    });
    const s = sequence(w);
    const ids = s.placements
      .filter((p) => p.groupId === "13 3")
      .map((p) => p.lessonId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("history and declared lessons", () => {
  test("history never appears on a date on or after today", () => {
    const s = sequence(later("2026-11-23"));
    const dated = s.placements.filter((p) => isHistory(p) && p.slotKey);
    expect(dated.length).toBe(18);
    for (const p of dated)
      expect(slotDate(p.slotKey as string) < "2026-11-23").toBe(true);
    // And nothing planned is dated before today.
    for (const p of s.placements)
      if (p.state === "planned" && p.slotKey)
        expect(slotDate(p.slotKey) >= "2026-11-23").toBe(true);
  });

  test("with no previous plan, only declared lessons are history", () => {
    const w = world();
    w.positions = w.positions.map((p) => ({
      ...p,
      nextLessonId: "c1#3",
      doneItemIds: ["c2"],
    }));
    const s = sequence(w);
    const history = s.placements.filter(isHistory);
    // c1#1, c1#2 and the three c2 lessons, for each of three groups.
    expect(history.length).toBe(15);
    expect(
      history.every((p) => p.state === "declared" && p.slotKey === null),
    ).toBe(true);
    expect(first.placements.filter(isHistory)).toEqual([]);
  });

  test("with no previous plan the log is not read", () => {
    const w = world();
    w.log = [entry("13 1", "c1#1", "taught", "13 1|2026-11-09|5")];
    expect(sequence(w).placements.filter(isHistory)).toEqual([]);
  });

  test("a declared lesson is not duplicated by history", () => {
    const w = later("2026-11-16");
    w.positions = w.positions.map((p) => ({ ...p, nextLessonId: "c1#3" }));
    const s = sequence(w);
    expect(placementsOf(s, "13 1", "c1#1")).toEqual([
      expect.objectContaining({ state: "declared", slotKey: null }),
    ]);
  });

  test("a group whose position is unknown keeps its history and its frozen lessons, and plans nothing new", () => {
    const w = later("2026-11-16");
    w.positions = w.positions.map((p) =>
      p.groupId === "13 1" ? { ...p, nextLessonId: "zz#1" } : p,
    );
    const s = sequence(w);
    expect(s.conflicts).toContainEqual({
      kind: "position-unknown",
      groupId: "13 1",
      lessonId: "zz#1",
    });
    expect(
      s.placements
        .filter((p) => p.groupId === "13 1")
        .map((p) => [p.lessonId, p.state, p.slotKey]),
    ).toEqual([
      ["c1#1", "assumed", "13 1|2026-11-09|5"],
      ["c1#2", "assumed", "13 1|2026-11-11|2"],
      ["c1#3", "assumed", "13 1|2026-11-13|6"],
      // today's lesson is frozen, exactly as in the previous plan
      ["c2#1", "planned", "13 1|2026-11-16|5"],
    ]);
    expect(onDates(s, ["2026-11-16", "2026-11-17"])).toEqual(
      onDates(first, ["2026-11-16", "2026-11-17"]),
    );
  });

  test("an unknown position does not wipe declared lessons or the freeze when the scheme loses her lesson", () => {
    const declaredWorld = world();
    declaredWorld.positions = declaredWorld.positions.map((p) => ({
      ...p,
      nextLessonId: "c1#3",
    }));
    const prev = sequence(declaredWorld);
    const w: PlanInputs = {
      ...world(),
      today: "2026-11-16",
      previous: prev,
    };
    w.items = w.items.map((i) => (i.id === "c1" ? { ...i, lessons: 0 } : i));
    w.positions = w.positions.map((p) => ({ ...p, nextLessonId: "c1#3" }));
    const s = sequence(w);
    expect(
      s.conflicts.filter((c) => c.kind === "position-unknown"),
    ).toHaveLength(3);
    expect(
      s.placements
        .filter((p) => p.groupId === "13 1" && p.state === "declared")
        .map((p) => [p.lessonId, p.slotKey]),
    ).toEqual([
      ["c1#1", null],
      ["c1#2", null],
    ]);
    const dates = ["2026-11-16", "2026-11-17"];
    expect(onDates(s, dates)).toEqual(onDates(prev, dates));
    expect(onDates(s, dates).length).toBeGreaterThan(0);
  });
});

describe("assessments in the freeze horizon", () => {
  const withU1 = (): PlanInputs => {
    const w = world();
    const a1 = w.items.find((i) => i.id === "a1");
    if (!a1?.assessment) throw new Error("no a1");
    w.items.push({
      ...a1,
      id: "u1",
      title: "u1",
      order: 2.5,
      assessment: { ...a1.assessment, date: null },
    });
    return w;
  };

  test("an undated whole-slot assessment in the horizon keeps its slot, and no lesson moves into it", () => {
    const prev = sequence(withU1());
    const row = prev.assessments.find(
      (a) => a.groupId === "13 1" && a.itemId === "u1",
    );
    expect(row?.slotKey).toBe("13 1|2026-11-23|5");
    const w: PlanInputs = { ...withU1(), today: "2026-11-23", previous: prev };
    w.items = w.items.map((i) => (i.id === "c2" ? { ...i, lessons: 5 } : i));
    const s = sequence(w);
    expect(
      s.assessments.find((a) => a.groupId === "13 1" && a.itemId === "u1"),
    ).toEqual(row);
    expect(s.placements.some((p) => p.slotKey === "13 1|2026-11-23|5")).toBe(
      false,
    );
  });

  test("a frozen assessment that she re-dated is kept and reported, not ignored", () => {
    // 27 Nov: a1 is today for 13 1 (P6) and 13 5 (P4); 13 3's a1 is on 1 Dec, outside the horizon (to 30 Nov).
    const prev = first;
    const redated = (date: string): PlanInputs => {
      const w: PlanInputs = { ...world(), today: "2026-11-27", previous: prev };
      w.items = w.items.map((i) =>
        i.id === "a1" && i.assessment
          ? { ...i, assessment: { ...i.assessment, date } }
          : i,
      );
      return w;
    };
    const same = sequence(redated("2026-11-27"));
    expect(same.conflicts.filter((c) => c.kind === "anchor-frozen")).toEqual(
      [],
    );
    const s = sequence(redated("2026-11-30"));
    expect(
      s.assessments
        .filter((a) => a.itemId === "a1")
        .map((a) => [a.groupId, a.slotKey]),
    ).toEqual([
      ["13 1", "13 1|2026-11-27|6"],
      ["13 3", "13 3|2026-12-01|5"],
      ["13 5", "13 5|2026-11-27|4"],
    ]);
    expect(s.conflicts.filter((c) => c.kind === "anchor-frozen")).toEqual([
      {
        kind: "anchor-frozen",
        groupId: "13 1",
        itemId: "a1",
        date: "2026-11-30",
        slotKey: "13 1|2026-11-27|6",
      },
      {
        kind: "anchor-frozen",
        groupId: "13 5",
        itemId: "a1",
        date: "2026-11-30",
        slotKey: "13 5|2026-11-27|4",
      },
    ]);
  });
});

describe("nextLesson", () => {
  test("it is the first planned lesson of the group, never a spare lesson", () => {
    expect(nextLesson(first, "13 1")).toBe("c1#1");
    expect(nextLesson(first, "13 3")).toBe("c1#1");
    expect(nextLesson(first, "nobody")).toBeNull();
  });
  test("it is null when nothing is planned", () => {
    const w = world();
    w.positions = w.positions.map((p) => ({ ...p, nextLessonId: null }));
    expect(nextLesson(sequence(w), "13 1")).toBeNull();
  });
});

describe("buffer lessons that absorbed a loss", () => {
  /** 13 1 alone, with b1 (4 buffer lessons) before a1: 10 lessons are due in 8 slots, so b1#3 and b1#4 absorb the loss. */
  const buffered = (patch: Partial<PlanInputs> = {}): PlanInputs => {
    const w = world();
    const c2 = w.items.find((i) => i.id === "c2");
    if (!c2) throw new Error("no c2");
    return {
      ...w,
      groups: w.groups.filter((g) => g.id === "13 1"),
      slots: w.slots.filter((s) => s.groupId === "13 1"),
      positions: w.positions.filter((p) => p.groupId === "13 1"),
      items: [
        ...w.items,
        {
          ...c2,
          id: "b1",
          kind: "buffer",
          order: 2.5,
          lessons: 4,
          title: "b1",
        },
      ],
      ...patch,
    };
  };
  /** a1 has been sat by everyone: after 27 Nov it is no longer a planned assessment. */
  const sat = (w: PlanInputs) =>
    w.items.map((i) =>
      i.assessment
        ? { ...i, assessment: { ...i.assessment, status: "sat" as const } }
        : i,
    );
  const buffers = (s: PlanSnapshot) =>
    s.placements
      .filter((p) => p.lessonId.startsWith("b1#"))
      .map((p) => [p.lessonId, p.slotKey ? slotDate(p.slotKey) : null]);
  const ok = (head: PlanSnapshot, fresh: PlanSnapshot, w: PlanInputs) =>
    isUpToDate({ head, fresh, slots: w.slots, flexEdits: [] });

  test("once their checkpoint has passed, they stay used: the plan does not teach them later", () => {
    const w = buffered();
    const head = sequence(w);
    expect(head.absorbed.map((a) => a.lessonId)).toEqual(["b1#3", "b1#4"]);
    const after = sequence({
      ...w,
      items: sat(w),
      today: "2026-12-02",
      previous: head,
    });
    // measured before the fix: b1#3 on 7 Dec and b1#4 on 9 Dec
    expect(buffers(after)).toEqual([
      ["b1#1", "2026-11-23"],
      ["b1#2", "2026-11-25"],
    ]);
    expect(head.absorbed).toEqual([
      { groupId: "13 1", lessonId: "b1#3", checkpointId: "cp:a1" },
      { groupId: "13 1", lessonId: "b1#4", checkpointId: "cp:a1" },
    ]);
    expect(after.absorbed).toEqual(head.absorbed);
    // and the chain remembers: a plan made on top of that one still has them used
    const month = sequence({
      ...w,
      items: sat(w),
      today: "2026-12-09",
      previous: after,
    });
    expect(buffers(month)).toEqual(buffers(after));
    expect(month.absorbed).toEqual(head.absorbed);
  });

  test("with nothing changed the plan stays up to date a week and a month later", () => {
    const w = buffered();
    const head = sequence(w);
    const week = sequence({ ...w, today: "2026-11-16", previous: head });
    expect(ok(head, week, w)).toBe(true);
    // a1 is behind every group by then, so it is marked sat; the plan itself is unchanged
    const month = sequence({
      ...w,
      items: sat(w),
      today: "2026-12-09",
      previous: head,
    });
    expect(ok(head, month, w)).toBe(true);
  });

  test("an absorption at a checkpoint still ahead is undone when the lost slot comes back", () => {
    const w = buffered();
    const lost = "13 1|2026-11-18|2";
    const cancelled = w.slots.map((s) =>
      s.key === lost ? { ...s, status: "cancelled" as const } : s,
    );
    const head = sequence({ ...w, slots: cancelled });
    expect(head.absorbed.map((a) => a.lessonId)).toEqual([
      "b1#2",
      "b1#3",
      "b1#4",
    ]);
    // a week later, still before a1, the slot is open again
    const restored = sequence({ ...w, today: "2026-11-16", previous: head });
    expect(restored.absorbed.map((a) => a.lessonId)).toEqual(["b1#3", "b1#4"]);
    expect(buffers(restored).map(([id]) => id)).toEqual(["b1#1", "b1#2"]);
  });
});
