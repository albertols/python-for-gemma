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

interface Scenario {
  counts: [number, number, number, number];
  positions: { group: string; at: number | null }[];
  pins: {
    group: string;
    lesson: number;
    slot: number;
    kind: "slot" | "not-after";
  }[];
  merges: { group: string; at: number }[];
  broken: { slot: number; status: "cancelled" | "cover" }[];
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
    }),
    { maxLength: 3 },
  ),
  pins: fc.array(
    fc.record({
      group: fc.constantFrom(...GROUPS),
      lesson: fc.nat(90),
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
  seed: fc.nat(1000),
});

function build(s: Scenario): PlanInputs {
  const w = paceWorld();
  const counts = [...s.counts];
  w.items = w.items.map((i) => {
    const k = ["c1", "c2", "c3", "c4"].indexOf(i.id);
    return k < 0 ? i : { ...i, lessons: counts[k] ?? i.lessons };
  });
  w.slots = slots.map((x): Slot => ({ ...x }));
  for (const b of s.broken) {
    const slot = w.slots[b.slot];
    if (slot) slot.status = b.status;
  }
  const ids = (group: string) =>
    expandLessons(w.items, [], group, "core").map((l) => l.id);
  const pickLesson = (group: string, n: number) => {
    const all = ids(group);
    return all.length === 0 ? "c1#1" : (all[n % all.length] ?? "c1#1");
  };
  const positions = new Map<string, Position>();
  for (const p of s.positions) {
    const all = ids(p.group);
    positions.set(p.group, {
      groupId: p.group,
      nextLessonId:
        p.at === null ? null : (all[p.at % Math.max(all.length, 1)] ?? null),
      doneItemIds: [],
      asOf: w.today,
    });
  }
  w.positions = GROUPS.map(
    (g) =>
      positions.get(g) ?? {
        groupId: g,
        nextLessonId: "c1#1",
        doneItemIds: [],
        asOf: w.today,
      },
  );
  w.pins = s.pins.map((p, i): Pin => {
    const lessonId = pickLesson(p.group, p.lesson);
    const slot = slots[p.slot] ?? slots[0];
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

  test("planned, declared, overflow and absorbed lessons add up to the scheme", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        for (const g of GROUPS) {
          const total = expandLessons(w.items, [], g, "core").length;
          const planned = snap.placements.filter(
            (p) =>
              p.groupId === g && !isFlex(p.lessonId) && p.state !== "declared",
          ).length;
          const declared = snap.placements.filter(
            (p) => p.groupId === g && p.state === "declared",
          ).length;
          const overflow = snap.overflow
            .filter((o) => o.groupId === g)
            .reduce((n, o) => n + o.lessonIds.length, 0);
          const absorbed = snap.absorbed.filter((a) => a.groupId === g).length;
          expect(planned + declared + overflow + absorbed).toBe(total);
        }
      }),
      run,
    ));

  test("every pin is honoured or appears in conflicts", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        for (const pin of w.pins) {
          const declared = snap.placements.some(
            (p) =>
              p.groupId === pin.groupId &&
              p.lessonId === pin.lessonId &&
              p.state === "declared",
          );
          if (declared) continue;
          const placement = snap.placements.find(
            (p) => p.groupId === pin.groupId && p.lessonId === pin.lessonId,
          );
          const conflicted = snap.conflicts.some(
            (c) => "pinId" in c && c.pinId === pin.id,
          );
          if (pin.kind === "slot") {
            const honoured =
              placement?.pinned === true && placement.slotKey === pin.slotKey;
            expect(honoured || conflicted).toBe(true);
          } else {
            const date =
              w.slots.find((x) => x.key === placement?.slotKey)?.date ?? null;
            expect((date !== null && date <= pin.date) || conflicted).toBe(
              true,
            );
          }
        }
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
          positions: shuffle(w.positions, s.seed + 5),
        };
        expect(sequence(shuffled)).toEqual(sequence(w));
      }),
      run,
    ));
});
