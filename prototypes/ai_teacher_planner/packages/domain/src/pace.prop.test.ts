import { paceWorld, SEED_EXAMS } from "@planner/fixtures";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { expandLessons } from "./lessons.ts";
import { finalContentIndex } from "./pace.ts";
import type {
  Checkpoint,
  Merge,
  Pin,
  PlanInputs,
  PlanSnapshot,
} from "./plan.ts";
import type { SowItem } from "./scheme.ts";
import { sequence } from "./sequence.ts";
import type { Slot } from "./slots.ts";

const base = paceWorld();
const GROUPS = base.groups.map((g) => g.id);
/** The autumn term and January: enough for windows, a revision block and an exam. */
const END = "2027-01-31";
const slots = base.slots.filter((s) => s.date <= END);
const ITEMS = ["c1", "c2", "b1", "c3", "c4"] as const;
const JANUARY = slots
  .map((s) => s.date)
  .filter((d) => d >= "2027-01-08")
  .filter((d, i, all) => all.indexOf(d) === i);

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
  counts: [number, number, number, number, number];
  overrides: { group: string; item: number; lessons: number }[];
  positions: { group: string; at: number }[];
  pins: { group: string; lesson: number; slot: number }[];
  merges: { group: string; at: number }[];
  broken: { slot: number; status: "cancelled" | "cover" }[];
  a1: "dated" | "undated" | "sat";
  a1Date: number;
  revisionWeeks: number;
  exam: number | null;
  seed: number;
}

const scenario: fc.Arbitrary<Scenario> = fc.record({
  counts: fc.tuple(
    fc.nat(8),
    fc.nat(8),
    fc.nat(3),
    fc.nat(10),
    fc.integer({ min: 0, max: 50 }),
  ),
  overrides: fc.array(
    fc.record({
      group: fc.constantFrom(...GROUPS),
      item: fc.nat(ITEMS.length - 1),
      lessons: fc.nat(8),
    }),
    { maxLength: 4 },
  ),
  positions: fc.array(
    fc.record({ group: fc.constantFrom(...GROUPS), at: fc.nat(20) }),
    { maxLength: 3 },
  ),
  pins: fc.array(
    fc.record({
      group: fc.constantFrom(...GROUPS),
      lesson: fc.nat(90),
      slot: fc.nat(200),
    }),
    { maxLength: 3 },
  ),
  merges: fc.array(
    fc.record({ group: fc.constantFrom(...GROUPS), at: fc.nat(90) }),
    { maxLength: 3 },
  ),
  broken: fc.array(
    fc.record({
      slot: fc.nat(slots.length - 1),
      status: fc.constantFrom("cancelled" as const, "cover" as const),
    }),
    { maxLength: 25 },
  ),
  a1: fc.constantFrom("dated" as const, "dated" as const, "undated", "sat"),
  a1Date: fc.integer({ min: 0, max: 20 }),
  revisionWeeks: fc.nat(3),
  exam: fc.option(fc.nat(JANUARY.length - 1), { nil: null }),
  seed: fc.nat(1000),
});

function build(s: Scenario): PlanInputs {
  const w = paceWorld();
  const a1 = w.items.find((i) => i.id === "a1");
  const c1 = w.items.find((i) => i.id === "c1");
  if (!a1?.assessment || !c1) throw new Error("paceWorld changed");
  const teaching = (
    id: string,
    order: number,
    lessons: number,
    kind: SowItem["kind"] = "teaching",
  ): SowItem => ({ ...c1, id, title: id, order, lessons, kind });
  const [n1, n2, nb, n3, n4] = s.counts;
  const day = `2026-11-${String(13 + s.a1Date).padStart(2, "0")}`;
  w.items = [
    teaching("c1", 1, n1),
    teaching("c2", 2, n2),
    teaching("b1", 3, nb, "buffer"),
    {
      ...a1,
      order: 4,
      assessment: {
        ...a1.assessment,
        date: s.a1 === "undated" ? null : day,
        status: s.a1 === "sat" ? "sat" : "planned",
      },
    },
    teaching("c3", 5, n3),
    teaching("c4", 6, n4),
  ];
  w.slots = slots.map((x): Slot => ({ ...x }));
  for (const b of s.broken) {
    const slot = w.slots[b.slot];
    if (slot) slot.status = b.status;
  }
  const seen = new Set<string>();
  w.overrides = s.overrides.flatMap((o) => {
    const itemId = ITEMS[o.item] ?? "c1";
    const k = `${o.group}|${itemId}`;
    if (seen.has(k)) return [];
    seen.add(k);
    return [{ groupId: o.group, itemId, lessons: o.lessons }];
  });
  const ids = (g: string) =>
    expandLessons(w.items, w.overrides, g, "core").map((l) => l.id);
  const at = new Map(s.positions.map((p) => [p.group, p.at]));
  w.positions = GROUPS.map((g) => {
    const all = ids(g);
    const n = at.get(g) ?? 0;
    return {
      groupId: g,
      nextLessonId: all.length === 0 ? null : (all[n % all.length] ?? null),
      doneItemIds: [],
      asOf: w.today,
    };
  });
  w.pins = s.pins.flatMap((p, i): Pin[] => {
    const all = ids(p.group);
    const own = w.slots.filter((x) => x.groupId === p.group);
    const lessonId = all[p.lesson % Math.max(all.length, 1)];
    const slot = own[p.slot % Math.max(own.length, 1)];
    if (!lessonId || !slot) return [];
    return [
      {
        id: `p${i}`,
        groupId: p.group,
        lessonId,
        kind: "slot",
        slotKey: slot.key,
      },
    ];
  });
  w.merges = s.merges.flatMap((m, i): Merge[] => {
    const all = ids(m.group);
    const first = all[m.at % Math.max(all.length, 1)];
    const second = all[all.indexOf(first ?? "") + 1];
    if (!first || !second) return [];
    return [{ id: `m${i}`, groupId: m.group, first, second }];
  });
  w.revisionWeeks = s.revisionWeeks;
  const wbs = SEED_EXAMS.find((e) => e.code === "WBS14 01");
  const date = s.exam === null ? undefined : JANUARY[s.exam];
  w.exams = wbs && date ? [{ ...wbs, id: "x:prop", date }] : [];
  return w;
}

const isFlex = (id: string) => id.startsWith("flex:");
const run = { numRuns: 80 };

/** Slot order as a string that sorts: date, then period. */
const at = (slot: Slot | undefined) =>
  slot ? `${slot.date}|${slot.period}` : "";

/**
 * Where a checkpoint stops a group, as a slot-order string: a placement before
 * it is in a window up to this checkpoint.
 */
function boundaryOf(
  snap: PlanSnapshot,
  byKey: ReadonlyMap<string, Slot>,
  cp: Checkpoint,
  g: string,
): string {
  if (cp.kind === "assessment") {
    const a = snap.assessments.find(
      (x) => x.groupId === g && x.itemId === cp.itemId,
    );
    if (a) return at(byKey.get(a.slotKey));
  }
  if (cp.kind === "block-end") return `${cp.date}|9`;
  if (cp.kind === "revision") return `${cp.perGroupDate?.[g] ?? cp.date}|0`;
  return `${cp.date}|0`;
}

describe("pace properties", () => {
  test("every property of the one-group sequencer still holds for three groups", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        const byKey = new Map(w.slots.map((x) => [x.key, x]));
        const seen = new Set<string>();
        const bySlot = new Map<string, number>();
        for (const p of snap.placements) {
          const k = `${p.groupId}|${p.lessonId}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          if (p.slotKey === null) continue;
          const slot = byKey.get(p.slotKey);
          expect(slot?.groupId).toBe(p.groupId);
          expect(slot?.status).not.toBe("cancelled");
          expect((slot?.date ?? "") >= w.today).toBe(true);
          if (p.mergedInto === null)
            bySlot.set(p.slotKey, (bySlot.get(p.slotKey) ?? 0) + 1);
        }
        for (const n of bySlot.values()) expect(n).toBe(1);
        for (const a of snap.assessments)
          if (a.slotUse === "whole") expect(bySlot.has(a.slotKey)).toBe(false);
        for (const g of GROUPS) {
          const scheme = expandLessons(w.items, w.overrides, g, "core");
          const order = new Map(scheme.map((l, i) => [l.id, i]));
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
          const mine = snap.placements.filter((p) => p.groupId === g);
          const has = new Set(mine.map((p) => p.lessonId));
          const content = mine.filter((p) => !isFlex(p.lessonId)).length;
          const neverPlaced = new Set(
            snap.overflow
              .filter((o) => o.groupId === g)
              .flatMap((o) => o.lessonIds)
              .filter((id) => !has.has(id)),
          );
          const absorbed = snap.absorbed.filter((a) => a.groupId === g).length;
          expect(content + neverPlaced.size + absorbed).toBe(scheme.length);
        }
        const shuffled: PlanInputs = {
          ...w,
          groups: shuffle(w.groups, s.seed),
          items: shuffle(w.items, s.seed + 1),
          slots: shuffle(w.slots, s.seed + 2),
          pins: shuffle(w.pins, s.seed + 3),
          merges: shuffle(w.merges, s.seed + 4),
          positions: shuffle(w.positions, s.seed + 5),
          overrides: shuffle(w.overrides, s.seed + 6),
          blocks: shuffle(w.blocks, s.seed + 7),
        };
        expect(sequence(shuffled)).toEqual(snap);
      }),
      run,
    ));

  test("at a checkpoint, no group has placed a lesson that comes after the pace run in the course's order", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        const byKey = new Map(w.slots.map((x) => [x.key, x]));
        const final = finalContentIndex(snap.checkpoints);
        for (const [k, cp] of snap.checkpoints.entries()) {
          if (k > final) break;
          // A group short here stops the run for everyone; only due lessons are placed.
          if (snap.overflow.some((o) => o.checkpointId === cp.id)) continue;
          const reached = (g: string) => {
            const end = boundaryOf(snap, byKey, cp, g);
            const out = new Set<string>();
            for (const p of snap.placements) {
              if (p.groupId !== g || isFlex(p.lessonId)) continue;
              if (p.state === "declared") out.add(p.lessonId);
              else if (at(byKey.get(p.slotKey ?? "")) < end)
                out.add(p.lessonId);
            }
            for (const a of snap.absorbed)
              if (a.groupId === g) out.add(a.lessonId);
            return out;
          };
          const placedAhead = (g: string) => {
            const end = boundaryOf(snap, byKey, cp, g);
            return snap.placements.filter(
              (p) =>
                p.groupId === g &&
                p.state === "planned" &&
                !p.pinned &&
                p.mergedInto === null &&
                !isFlex(p.lessonId) &&
                at(byKey.get(p.slotKey ?? "")) < end,
            );
          };
          for (const g of GROUPS)
            for (const h of GROUPS) {
              if (g === h) continue;
              const hLessons = new Set(
                expandLessons(w.items, w.overrides, h, "core").map((l) => l.id),
              );
              const hPinned = new Set(
                snap.placements
                  .filter((p) => p.groupId === h && p.pinned)
                  .map((p) => p.lessonId),
              );
              const hReached = reached(h);
              for (const p of placedAhead(g)) {
                if (!hLessons.has(p.lessonId) || hPinned.has(p.lessonId))
                  continue;
                expect(
                  hReached.has(p.lessonId),
                  `${g} has ${p.lessonId} before ${cp.id} and ${h} does not`,
                ).toBe(true);
              }
            }
        }
      }),
      run,
    ));

  test("a spare lesson is never followed, in the same window, by a content lesson", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        const byKey = new Map(w.slots.map((x) => [x.key, x]));
        const final = finalContentIndex(snap.checkpoints);
        for (const g of GROUPS) {
          const content = snap.placements.filter(
            (p) =>
              p.groupId === g &&
              p.slotKey !== null &&
              !p.pinned &&
              !isFlex(p.lessonId),
          );
          for (const f of snap.placements) {
            if (f.groupId !== g || !isFlex(f.lessonId)) continue;
            const cpId = f.lessonId.slice(`flex:${g}:`.length).split("#")[0];
            const k = snap.checkpoints.findIndex((c) => c.id === cpId);
            const cp = snap.checkpoints[k];
            expect(cp).toBeDefined();
            if (!cp) continue;
            // After the final content checkpoint, and in the revision block, no content follows at all.
            const end = k >= final ? "~" : boundaryOf(snap, byKey, cp, g);
            const from = at(byKey.get(f.slotKey ?? ""));
            const after = content.filter((p) => {
              const here = at(byKey.get(p.slotKey ?? ""));
              return here > from && here < end;
            });
            expect(after.map((p) => p.lessonId)).toEqual([]);
          }
        }
      }),
      run,
    ));

  test("nothing is placed on or after a group's official exam, and no content in its revision block", () =>
    fc.assert(
      fc.property(scenario, (s) => {
        const w = build(s);
        const snap = sequence(w);
        const byKey = new Map(w.slots.map((x) => [x.key, x]));
        const exam = w.exams[0]?.date ?? "~";
        const revision = snap.checkpoints.find((c) => c.kind === "revision");
        if (s.revisionWeeks === 0) expect(revision).toBeUndefined();
        for (const p of snap.placements) {
          const slot = byKey.get(p.slotKey ?? "");
          if (!slot) continue;
          expect(slot.date < exam).toBe(true);
          const start = revision?.perGroupDate?.[p.groupId] ?? "~";
          if (!p.pinned && !isFlex(p.lessonId))
            expect(slot.date < start).toBe(true);
        }
        for (const a of snap.assessments)
          expect((byKey.get(a.slotKey)?.date ?? "") < exam).toBe(true);
      }),
      run,
    ));
});
