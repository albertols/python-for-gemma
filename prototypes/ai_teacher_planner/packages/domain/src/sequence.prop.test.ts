import { paceWorld } from "@planner/fixtures";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { expandLessons } from "./lessons.ts";
import type { Merge, Pin, PlanInputs, Position } from "./plan.ts";
import { sequence } from "./sequence.ts";
import type { Slot } from "./slots.ts";

const base = paceWorld();
const GROUPS = base.groups.map((g) => g.id);
/** Keep the search small: the autumn term is plenty to run out of room in. */
const END = "2027-01-31";
const slots = base.slots.filter((s) => s.date <= END);

/** A deterministic shuffle: sort by a keyed hash so a seed fixes the order. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const keyed = items.map((item, i) => ({
    item,
    key: Math.imul(i + 1, 2654435761 + seed) % 1000003,
    i,
  }));
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);
  return keyed.map((k) => k.item);
}

type A1Mode = "dated" | "undated" | "sat";

interface Scenario {
  counts: [number, number, number, number];
  positions: {
    group: string;
    at: number | null;
    unknown: boolean;
    done: string[];
  }[];
  pins: {
    group: string;
    lesson: number;
    unknown: boolean;
    own: boolean;
    slot: number;
    kind: "slot" | "not-after";
  }[];
  merges: { group: string; at: number }[];
  broken: { slot: number; status: "cancelled" | "cover" }[];
  a1: A1Mode;
  a1Use: "whole" | "in-lesson";
  seed: number;
}

const scenario: fc.Arbitrary<Scenario> = fc.record({
  counts: fc.tuple(
    fc.nat(12),
    fc.nat(12),
    fc.nat(12),
    fc.integer({ min: 0, max: 60 }),
  ),
  positions: fc.array(
    fc.record({
      group: fc.constantFrom(...GROUPS),
      at: fc.option(fc.nat(80), { nil: null }),
      unknown: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
      done: fc.subarray(["c1", "c2", "c3", "c4", "a1"]),
    }),
    { maxLength: 3 },
  ),
  pins: fc.array(
    fc.record({
      group: fc.constantFrom(...GROUPS),
      lesson: fc.nat(90),
      unknown: fc.integer({ min: 0, max: 5 }).map((n) => n === 0),
      own: fc.integer({ min: 0, max: 3 }).map((n) => n > 0),
      slot: fc.nat(slots.length - 1),
      kind: fc.constantFrom("slot" as const, "not-after" as const),
    }),
    { maxLength: 6 },
  ),
  merges: fc.array(
    fc.record({ group: fc.constantFrom(...GROUPS), at: fc.nat(90) }),
    { maxLength: 4 },
  ),
  broken: fc.array(
    fc.record({
      slot: fc.nat(slots.length - 1),
      status: fc.constantFrom("cancelled" as const, "cover" as const),
    }),
    { maxLength: 25 },
  ),
  a1: fc.constantFrom<A1Mode>("dated", "dated", "undated", "sat"),
  a1Use: fc.constantFrom("whole" as const, "in-lesson" as const),
  seed: fc.nat(1000),
});

function build(s: Scenario): PlanInputs {
  const w = paceWorld();
  const counts = [...s.counts];
  w.items = w.items.map((i) => {
    const k = ["c1", "c2", "c3", "c4"].indexOf(i.id);
    if (k >= 0) return { ...i, lessons: counts[k] ?? i.lessons };
    if (i.id === "a1" && i.assessment)
      return {
        ...i,
        assessment: {
          ...i.assessment,
          date: s.a1 === "undated" ? null : i.assessment.date,
          status: s.a1 === "sat" ? "sat" : "planned",
          slotUse: s.a1Use,
        },
      };
    return i;
  });
  w.slots = slots.map((x): Slot => ({ ...x }));
  for (const b of s.broken) {
    const slot = w.slots[b.slot];
    if (slot) slot.status = b.status;
  }
  const ids = (group: string) =>
    expandLessons(w.items, [], group, "core").map((l) => l.id);
  const pickLesson = (group: string, n: number, unknown = false) => {
    const all = ids(group);
    if (unknown || all.length === 0) return `zz#${n}`;
    return all[n % all.length] ?? `zz#${n}`;
  };
  const positions = new Map<string, Position>();
  for (const p of s.positions) {
    const all = ids(p.group);
    positions.set(p.group, {
      groupId: p.group,
      nextLessonId: p.unknown
        ? "zz#1"
        : p.at === null
          ? null
          : (all[p.at % Math.max(all.length, 1)] ?? null),
      doneItemIds: p.done,
      asOf: w.today,
    });
  }
  w.positions = GROUPS.map(
    (g) =>
      positions.get(g) ?? {
        groupId: g,
        nextLessonId: ids(g)[0] ?? null,
        doneItemIds: [],
        asOf: w.today,
      },
  );
  w.pins = s.pins.map((p, i): Pin => {
    const lessonId = pickLesson(p.group, p.lesson, p.unknown);
    const own = w.slots.filter(
      (x) => x.groupId === p.group && x.date >= w.today,
    );
    const slot = p.own ? own[p.slot % Math.max(own.length, 1)] : slots[p.slot];
    return p.kind === "slot"
      ? {
          id: `p${i}`,
          groupId: p.group,
          lessonId,
          kind: "slot",
          slotKey: slot?.key ?? "",
        }
      : {
          id: `p${i}`,
          groupId: p.group,
          lessonId,
          kind: "not-after",
          date: slot?.date ?? w.today,
        };
  });
  w.merges = s.merges.map((m, i): Merge => {
    const first = pickLesson(m.group, m.at);
    const all = ids(m.group);
    const second = all[all.indexOf(first) + 1] ?? first;
    return { id: `m${i}`, groupId: m.group, first, second };
  });
  return w;
}

/** Groups whose position names a lesson that is not in the scheme: nothing is planned for them. */
const unplanned = (snap: ReturnType<typeof sequence>) =>
  new Set(
    snap.conflicts.flatMap((c) =>
      c.kind === "position-unknown" ? [c.groupId] : [],
    ),
  );

const isFlex = (id: string) => id.startsWith("flex:");
const run = { numRuns: 60 };

describe("sequence properties", () => {
  test("each lesson is placed at most once, and a slot holds one lesson unless a merged pair", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        const seen = new Set<string>();
        for (const p of snap.placements) {
          const k = `${p.groupId}|${p.lessonId}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
        const bySlot = new Map<string, typeof snap.placements>();
        for (const p of snap.placements)
          if (p.slotKey)
            bySlot.set(p.slotKey, [...(bySlot.get(p.slotKey) ?? []), p]);
        for (const here of bySlot.values()) {
          const owners = here.filter((p) => p.mergedInto === null);
          expect(owners.length).toBe(1);
          for (const p of here)
            if (p.mergedInto !== null)
              expect(here.some((o) => o.lessonId === p.mergedInto)).toBe(true);
        }
      }),
      run,
    ));

  test("no placement is on a cancelled slot, a past slot or another group's slot", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const byKey = new Map(w.slots.map((x) => [x.key, x]));
        for (const p of sequence(w).placements) {
          if (p.slotKey === null) continue;
          const slot = byKey.get(p.slotKey);
          expect(slot).toBeDefined();
          expect(slot?.status).not.toBe("cancelled");
          expect(slot?.groupId).toBe(p.groupId);
          expect((slot?.date ?? "") >= w.today).toBe(true);
          expect(p.viaCover).toBe(slot?.status === "cover");
        }
      }),
      run,
    ));

  test("unpinned lessons appear in scheme order when read in slot order", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        for (const g of GROUPS) {
          if (unplanned(snap).has(g)) continue;
          const order = new Map(
            expandLessons(w.items, [], g, "core").map((l, i) => [l.id, i]),
          );
          const read = snap.placements
            .filter(
              (p) =>
                p.groupId === g &&
                p.slotKey !== null &&
                !p.pinned &&
                p.mergedInto === null &&
                !isFlex(p.lessonId),
            )
            .map((p) => order.get(p.lessonId) ?? -1);
          expect(read).toEqual([...read].sort((a, b) => a - b));
        }
      }),
      run,
    ));

  // Task 2.3: overflow at a checkpoint before the last is "short there", and the
  // lesson is first in line after it, so it can be both overflow and placed.
  // A lesson with no placement is counted once, through the overflow.
  test("planned, declared, absorbed and never-placed overflow lessons add up to the scheme", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        for (const g of GROUPS) {
          if (unplanned(snap).has(g)) {
            expect(snap.placements.some((p) => p.groupId === g)).toBe(false);
            continue;
          }
          const total = expandLessons(w.items, [], g, "core").length;
          const mine = snap.placements.filter((p) => p.groupId === g);
          const has = new Set(mine.map((p) => p.lessonId));
          const planned = mine.filter(
            (p) => !isFlex(p.lessonId) && p.state !== "declared",
          ).length;
          const declared = mine.filter((p) => p.state === "declared").length;
          const overflowed = snap.overflow
            .filter((o) => o.groupId === g)
            .flatMap((o) => o.lessonIds);
          const neverPlaced = new Set(overflowed.filter((id) => !has.has(id)));
          const absorbed = snap.absorbed.filter((a) => a.groupId === g).length;
          expect(planned + declared + neverPlaced.size + absorbed).toBe(total);
          // A lesson short at a checkpoint and placed later is placed after that checkpoint's date.
          const dateOf = new Map(w.slots.map((x) => [x.key, x.date]));
          for (const o of snap.overflow.filter((x) => x.groupId === g)) {
            const cp = snap.checkpoints.find((c) => c.id === o.checkpointId);
            for (const id of o.lessonIds) {
              const key = mine.find((p) => p.lessonId === id)?.slotKey;
              if (key)
                expect((dateOf.get(key) ?? "") >= (cp?.date ?? "~")).toBe(true);
            }
          }
        }
      }),
      run,
    ));

  test("every pin is honoured or reported", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        const skipped = unplanned(snap);
        for (const pin of w.pins) {
          if (skipped.has(pin.groupId)) continue;
          const known = expandLessons(w.items, [], pin.groupId, "core").some(
            (l) => l.id === pin.lessonId,
          );
          const placement = snap.placements.find(
            (p) => p.groupId === pin.groupId && p.lessonId === pin.lessonId,
          );
          const reported = snap.conflicts.some(
            (c) => "pinId" in c && c.pinId === pin.id,
          );
          if (!known) {
            expect(snap.conflicts).toContainEqual(
              expect.objectContaining({
                kind: "pin-lesson-unknown",
                pinId: pin.id,
              }),
            );
            continue;
          }
          // A pin on a lesson already taught is moot.
          if (placement?.state === "declared") continue;
          if (pin.kind === "slot") {
            const honoured =
              placement?.pinned === true && placement.slotKey === pin.slotKey;
            expect(honoured || reported).toBe(true);
          } else {
            const date =
              w.slots.find((x) => x.key === placement?.slotKey)?.date ?? null;
            expect((date !== null && date <= pin.date) || reported).toBe(true);
          }
        }
      }),
      run,
    ));

  test("no lesson shares a slot with a whole-slot assessment", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const snap = sequence(build(s));
        for (const a of snap.assessments)
          if (a.slotUse === "whole")
            expect(snap.placements.some((p) => p.slotKey === a.slotKey)).toBe(
              false,
            );
      }),
      run,
    ));

  test("shuffling items, slots, pins, merges and positions gives a deep-equal snapshot", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const shuffled: PlanInputs = {
          ...w,
          groups: shuffle(w.groups, s.seed),
          items: shuffle(w.items, s.seed + 1),
          slots: shuffle(w.slots, s.seed + 2),
          pins: shuffle(w.pins, s.seed + 3),
          merges: shuffle(w.merges, s.seed + 4),
          positions: shuffle(w.positions, s.seed + 5).map((p) => ({
            ...p,
            doneItemIds: shuffle(p.doneItemIds, s.seed + 6),
          })),
          blocks: shuffle(w.blocks, s.seed + 7),
        };
        expect(sequence(shuffled)).toEqual(sequence(w));
      }),
      run,
    ));
});
