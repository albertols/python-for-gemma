import { paceWorld } from "@planner/fixtures";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { delivered, freezeHorizonEnd, isHistory, slotDate } from "./history.ts";
import type {
  LessonLogEntry,
  Merge,
  Pin,
  Placement,
  PlanInputs,
} from "./plan.ts";
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
  /** The scheme has an undated whole-slot assessment, so assessments can be frozen. */
  undated: boolean;
  today: string;
  counts: [number, number, number, number];
  broken: { slot: number; status: "cancelled" | "cover" }[];
  pins: { group: string; lesson: number; slot: number; slotPin: boolean }[];
  merges: { group: string; at: number }[];
}
const change: fc.Arbitrary<Change> = fc.record({
  undated: fc.boolean(),
  today: fc.constantFrom(...TODAYS),
  // c1 may drop to 0: her position c1#1 is then unknown, and the freeze must still hold.
  counts: fc.tuple(
    fc.nat(8),
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

/** The scheme with an undated whole-slot assessment after c2, when `undated`. */
function worldFor(undated: boolean): PlanInputs {
  const w = paceWorld();
  const a1 = w.items.find((i) => i.id === "a1");
  if (undated && a1?.assessment)
    w.items.push({
      ...a1,
      id: "u1",
      title: "u1",
      order: 2.5,
      assessment: { ...a1.assessment, date: null },
    });
  return w;
}
const firsts = { false: first, true: sequence(worldFor(true)) };

/** The unchanged world, with a later today. */
const unchanged = (today: string, undated = false): PlanInputs => ({
  ...worldFor(undated),
  today,
  previous: firsts[`${undated}`],
});

/** The same world with her edits to the scheme, pins, merges and slots from today on. */
function changed(c: Change): PlanInputs {
  const w = unchanged(c.today, c.undated);
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
        const before = sequence(
          unchanged(c.today, c.undated),
        ).placements.filter(isHistory);
        const after = sequence(changed(c)).placements.filter(isHistory);
        expect(before.length).toBeGreaterThan(0);
        expect(after).toEqual(before);
      }),
      run,
    ));

  test("the horizon's placements and assessments are exactly the previous plan's", () =>
    fc.assert(
      fc.property(change, (c) => {
        const w = changed(c);
        const previous = firsts[`${c.undated}`];
        const horizon = freezeHorizonEnd(
          c.today,
          w.slots.filter((s) => GROUPS.includes(s.groupId)),
        );
        const usable = new Set(
          w.slots
            .filter((s) => s.status === "open" || s.status === "cover")
            .map((s) => s.key),
        );
        const inWindow = (key: string | null) =>
          key !== null &&
          slotDate(key) >= c.today &&
          (horizon === null || slotDate(key) <= horizon);
        const snap = sequence(w);
        const byKey = (
          a: { slotKey: string | null; lessonId?: string },
          b: typeof a,
        ) =>
          (a.slotKey ?? "").localeCompare(b.slotKey ?? "") ||
          (a.lessonId ?? "").localeCompare(b.lessonId ?? "");
        const expected = previous.placements
          .filter((p) => inWindow(p.slotKey) && usable.has(p.slotKey ?? ""))
          .sort(byKey);
        const got = snap.placements
          .filter((p) => inWindow(p.slotKey))
          .sort(byKey);
        expect(got).toEqual(expected);
        const rows = previous.assessments.filter(
          (a) =>
            a.itemId === "u1" && inWindow(a.slotKey) && usable.has(a.slotKey),
        );
        for (const r of rows) expect(snap.assessments).toContainEqual(r);
      }),
      run,
    ));

  test("nothing after the horizon is read from the previous plan", () =>
    fc.assert(
      fc.property(change, (c) => {
        const w = changed(c);
        const horizon = freezeHorizonEnd(
          c.today,
          w.slots.filter((s) => GROUPS.includes(s.groupId)),
        );
        const previous = firsts[`${c.undated}`];
        const trimmed = {
          ...previous,
          placements: previous.placements.filter(
            (p) =>
              p.slotKey === null ||
              horizon === null ||
              slotDate(p.slotKey) <= horizon,
          ),
          assessments: previous.assessments.filter(
            (a) => horizon === null || slotDate(a.slotKey) <= horizon,
          ),
        };
        expect(sequence({ ...w, previous: trimmed })).toEqual(sequence(w));
      }),
      run,
    ));

  test("after any replan a slot holds one lesson (a merged pair counts once) or one whole assessment, never both", () =>
    fc.assert(
      fc.property(change, (c) => {
        const snap = sequence(changed(c));
        const lessonSlots = new Set<string>();
        for (const p of snap.placements) {
          if (
            p.slotKey === null ||
            p.mergedInto !== null ||
            p.state === "skipped"
          )
            continue;
          expect(lessonSlots.has(p.slotKey)).toBe(false);
          lessonSlots.add(p.slotKey);
        }
        const whole = new Set<string>();
        for (const a of snap.assessments) {
          if (a.slotUse !== "whole") continue;
          expect(whole.has(a.slotKey)).toBe(false);
          whole.add(a.slotKey);
          expect(lessonSlots.has(a.slotKey)).toBe(false);
        }
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
          const log: LessonLogEntry[] = entries.map((e, i) => {
            const own = slots.filter((s) => s.groupId === e.group);
            const slot = own[e.at % own.length];
            return {
              seq: i + 1,
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
  test("the order the log arrives in never changes the plan: the highest seq wins for a placement, whatever its recordedOn", () => {
    // a few lessons of 13 1 and 13 3 that are in the past on 23 Nov, so entries often hit the same placement
    const own = first.placements.filter(
      (p) =>
        (p.groupId === "13 1" || p.groupId === "13 3") &&
        ["c1#1", "c1#2", "c1#3"].includes(p.lessonId) &&
        p.slotKey !== null,
    );
    const days = ["2026-11-10", "2026-11-16", "2026-11-20", "2026-11-23"];
    const entry = fc.record({
      at: fc.nat(own.length - 1),
      outcome: fc.constantFrom(
        "taught" as const,
        "cover" as const,
        "skipped" as const,
        "homework" as const,
      ),
      recordedOn: fc.constantFrom(...days),
    });
    const entries = fc
      .array(entry, { minLength: 2, maxLength: 8 })
      .chain((list) =>
        fc.tuple(
          fc.constant(list),
          fc.shuffledSubarray(
            list.map((_, i) => i),
            { minLength: list.length, maxLength: list.length },
          ),
        ),
      );
    fc.assert(
      fc.property(entries, ([list, order]) => {
        const log: LessonLogEntry[] = list.map((e, i) => {
          const p = own[e.at] as Placement;
          return {
            seq: i + 1,
            groupId: p.groupId,
            lessonId: p.lessonId,
            slotKey: p.slotKey,
            outcome: e.outcome,
            recordedOn: e.recordedOn,
            note: null,
          };
        });
        const shuffled = order.map((i) => log[i] as LessonLogEntry);
        const plan = (l: LessonLogEntry[]) =>
          sequence({
            ...paceWorld(),
            today: "2026-11-23",
            previous: first,
            log: l,
          });
        expect(plan(shuffled)).toEqual(plan(log));
        // and the winner is the highest seq for each placement
        const result = plan(shuffled);
        for (const p of own) {
          const mine = log.filter(
            (e) =>
              e.groupId === p.groupId &&
              e.lessonId === p.lessonId &&
              e.slotKey === p.slotKey,
          );
          const last = mine.at(-1);
          if (!last) continue;
          const state = result.placements.find(
            (q) =>
              q.groupId === p.groupId &&
              q.lessonId === p.lessonId &&
              q.slotKey === p.slotKey,
          )?.state;
          expect(state).toBe(last.outcome);
        }
      }),
      { numRuns: 100 },
    );
  });
});
