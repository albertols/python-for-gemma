import { paceWorld } from "@planner/fixtures";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { delivered, freezeHorizonEnd, isHistory, slotDate } from "./history.ts";
import type { LessonLogEntry, Merge, Pin, PlanInputs } from "./plan.ts";
import { sequence } from "./sequence.ts";
import type { Slot } from "./slots.ts";

const base = paceWorld();
const GROUPS = base.groups.map((g) => g.id);
const END = "2027-01-31";
const slots = base.slots.filter((s) => s.date <= END);
const first = sequence(base);
const TODAYS = [
  "2026-11-10",
  "2026-11-16",
  "2026-11-23",
  "2026-11-27",
  "2026-12-01",
  "2026-12-08",
  "2027-01-12",
];
const run = { numRuns: 60 };
const isFlex = (id: string) => id.startsWith("flex:");

interface Change {
  today: string;
  counts: [number, number, number, number];
  broken: { slot: number; status: "cancelled" | "cover" }[];
  pins: { group: string; lesson: number; slot: number; slotPin: boolean }[];
  merges: { group: string; at: number }[];
}
const change: fc.Arbitrary<Change> = fc.record({
  today: fc.constantFrom(...TODAYS),
  // c1 keeps at least one lesson: her position is c1#1, and one that is not in the scheme plans nothing.
  counts: fc.tuple(
    fc.integer({ min: 1, max: 8 }),
    fc.nat(8),
    fc.nat(8),
    fc.integer({ min: 0, max: 30 }),
  ),
  broken: fc.array(
    fc.record({
      slot: fc.nat(slots.length - 1),
      status: fc.constantFrom("cancelled" as const, "cover" as const),
    }),
    { maxLength: 30 },
  ),
  pins: fc.array(
    fc.record({
      group: fc.constantFrom(...GROUPS),
      lesson: fc.nat(14),
      slot: fc.nat(slots.length - 1),
      slotPin: fc.boolean(),
    }),
    { maxLength: 5 },
  ),
  merges: fc.array(
    fc.record({ group: fc.constantFrom(...GROUPS), at: fc.nat(13) }),
    { maxLength: 3 },
  ),
});

/** The unchanged world, with a later today. */
const unchanged = (today: string): PlanInputs => ({
  ...paceWorld(),
  today,
  previous: first,
});

/** The same world with her edits to the scheme, pins, merges and slots from today on. */
function changed(c: Change): PlanInputs {
  const w = unchanged(c.today);
  w.items = w.items.map((i) => {
    const k = ["c1", "c2", "c3", "c4"].indexOf(i.id);
    return k >= 0 ? { ...i, lessons: c.counts[k] ?? i.lessons } : i;
  });
  w.slots = slots.map((x): Slot => ({ ...x }));
  for (const b of c.broken) {
    const slot = w.slots[b.slot];
    if (slot && slot.date >= c.today) slot.status = b.status;
  }
  const ids = (n: number) => `c${[1, 2, 3, 4][n % 4]}#${(n % 3) + 1}`;
  w.pins = c.pins.map((p, i): Pin => {
    const slot = slots[p.slot];
    return p.slotPin
      ? {
          id: `p${i}`,
          groupId: p.group,
          lessonId: ids(p.lesson),
          kind: "slot",
          slotKey: slot?.key ?? "",
        }
      : {
          id: `p${i}`,
          groupId: p.group,
          lessonId: ids(p.lesson),
          kind: "not-after",
          date: slot?.date ?? c.today,
        };
  });
  w.merges = c.merges.map(
    (m, i): Merge => ({
      id: `m${i}`,
      groupId: m.group,
      first: ids(m.at),
      second: ids(m.at + 1),
    }),
  );
  return w;
}

describe("history properties", () => {
  test("history is deep-equal before and after any change dated on or after today", () =>
    fc.assert(
      fc.property(change, (c) => {
        const before = sequence(unchanged(c.today)).placements.filter(
          isHistory,
        );
        const after = sequence(changed(c)).placements.filter(isHistory);
        expect(before.length).toBeGreaterThan(0);
        expect(after).toEqual(before);
      }),
      run,
    ));

  test("frozen placements are copied unless their slot stopped being usable", () =>
    fc.assert(
      fc.property(change, (c) => {
        const baseline = unchanged(c.today);
        const horizon = freezeHorizonEnd(c.today, baseline.slots);
        const w = changed(c);
        const usable = new Set(
          w.slots
            .filter((s) => s.status === "open" || s.status === "cover")
            .map((s) => s.key),
        );
        const after = sequence(w).placements;
        const frozen = first.placements.filter((p) => {
          if (p.slotKey === null) return false;
          const d = slotDate(p.slotKey);
          return (
            d >= c.today &&
            (horizon === null || d <= horizon) &&
            usable.has(p.slotKey)
          );
        });
        for (const p of frozen) expect(after).toContainEqual(p);
      }),
      run,
    ));

  test("delivered never shrinks between replans, except for lessons the log skipped", () =>
    fc.assert(
      fc.property(
        fc.constantFrom(...TODAYS),
        fc.constantFrom(...TODAYS),
        fc.array(
          fc.record({
            group: fc.constantFrom(...GROUPS),
            lesson: fc.nat(14),
            outcome: fc.constantFrom(
              "taught" as const,
              "cover" as const,
              "skipped" as const,
              "homework" as const,
            ),
            at: fc.nat(30),
          }),
          { maxLength: 6 },
        ),
        (d1, d2, entries) => {
          const [t1, t2] = d1 <= d2 ? [d1, d2] : [d2, d1];
          const lessonOf = (n: number) =>
            `c${[1, 2, 3, 4][n % 4]}#${(n % 3) + 1}`;
          const log: LessonLogEntry[] = entries.map((e) => {
            const own = slots.filter((s) => s.groupId === e.group);
            const slot = own[e.at % own.length];
            return {
              groupId: e.group,
              lessonId: lessonOf(e.lesson),
              slotKey: slot?.key ?? null,
              outcome: e.outcome,
              recordedOn: t2,
              note: null,
            };
          });
          const mid = sequence({ ...paceWorld(), today: t1, previous: first });
          const end = sequence({
            ...paceWorld(),
            today: t2,
            previous: mid,
            log,
          });
          const skipped = new Set(
            log
              .filter((e) => e.outcome === "skipped")
              .map((e) => e.groupId + e.lessonId),
          );
          for (const g of GROUPS)
            for (const id of delivered(mid, g))
              if (!skipped.has(g + id))
                expect(delivered(end, g).has(id)).toBe(true);
          // A lesson is never planned in the past, and never planned twice.
          for (const g of GROUPS) {
            const planned = end.placements.filter(
              (p) =>
                p.groupId === g && p.state === "planned" && !isFlex(p.lessonId),
            );
            expect(new Set(planned.map((p) => p.lessonId)).size).toBe(
              planned.length,
            );
            for (const p of planned)
              expect(slotDate(p.slotKey ?? "") >= t2).toBe(true);
          }
        },
      ),
      run,
    ));

  test("a lesson id appears once per group unless an earlier placement was skipped", () =>
    fc.assert(
      fc.property(change, (c) => {
        const snap = sequence(changed(c));
        const seen = new Set<string>();
        for (const p of snap.placements.filter((x) => x.state !== "skipped")) {
          const k = `${p.groupId}|${p.lessonId}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }),
      run,
    ));
});
