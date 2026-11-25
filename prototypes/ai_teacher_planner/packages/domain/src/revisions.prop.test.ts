import { paceWorld } from "@planner/fixtures";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { PlanInputs, PlanSnapshot } from "./plan.ts";
import {
  acceptProposal,
  headSnapshot,
  type PlanChain,
  propose,
  snapshotKey,
  undo,
} from "./revisions.ts";
import { sequence } from "./sequence.ts";

const base = paceWorld();
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
/** Vitest's own deep equality, as a yes or no. */
const isDeepStrictEqual = (a: unknown, b: unknown): boolean => {
  try {
    expect(a).toStrictEqual(b);
    return true;
  } catch {
    return false;
  }
};
const run = { numRuns: 25 };
const cancelled = (keys: string[], today: string): PlanInputs => ({
  ...base,
  today,
  slots: base.slots.map((s) =>
    keys.includes(s.key) ? { ...s, status: "cancelled" as const } : s,
  ),
});
const open = base.slots.filter(
  (s) => s.date >= "2026-11-12" && s.date < "2026-12-23",
);
const TODAYS = ["2026-11-09", "2026-11-16", "2026-11-23", "2026-12-01"];

/** A world: some cancelled slots and a today. */
const worlds = fc
  .record({
    cut: fc.array(fc.nat(open.length - 1), { maxLength: 6 }),
    today: fc.constantFrom(...TODAYS),
  })
  .map(({ cut, today }) =>
    cancelled(
      cut.map((i) => open[i]?.key ?? ""),
      today,
    ),
  );

/** A chain built by accepting a proposal for each world in turn. */
function build(inputs: PlanInputs[]): PlanChain {
  let chain: PlanChain = { planId: "p", headId: null, revisions: {} };
  inputs.forEach((w, i) => {
    const head = headSnapshot(chain);
    const p = propose({
      planId: "p",
      baseRevisionId: chain.headId,
      head,
      inputs: w,
      label: `change ${i}`,
    });
    const out = acceptProposal(chain, p, {
      id: `r${i}`,
      createdAt: "2026-11-09T09:00:00Z",
    });
    if (!out.ok) throw new Error("refused");
    chain = out.chain;
  });
  return chain;
}

describe("revision properties", () => {
  test("undo of an accept restores the head exactly and keeps every revision", () =>
    fc.assert(
      fc.property(
        fc.array(worlds, { minLength: 1, maxLength: 2 }),
        worlds,
        (before, next) => {
          const chain = build(before);
          const p = propose({
            planId: "p",
            baseRevisionId: chain.headId,
            head: headSnapshot(chain),
            inputs: next,
            label: "next",
          });
          const accepted = acceptProposal(chain, p, {
            id: "new",
            createdAt: "x",
          });
          if (!accepted.ok) throw new Error("refused");
          const undone = undo(accepted.chain);
          if (!undone.ok) throw new Error("nothing to undo");
          expect(headSnapshot(undone.chain)).toEqual(headSnapshot(chain));
          expect(undone.chain.headId).toBe(chain.headId);
          expect(Object.keys(undone.chain.revisions)).toEqual([
            ...Object.keys(chain.revisions),
            "new",
          ]);
        },
      ),
      run,
    ));

  test("a proposal for the first plan is undoable only after a second", () =>
    fc.assert(
      fc.property(worlds, (w) => {
        const chain = build([w]);
        expect(undo(chain)).toEqual({ ok: false, reason: "nothing-to-undo" });
      }),
      run,
    ));

  const pool: PlanSnapshot[] = [
    sequence(base),
    sequence(cancelled([open[3]?.key ?? ""], "2026-11-09")),
    sequence(cancelled([open[7]?.key ?? ""], "2026-11-16")),
  ];
  const variant = fc
    .record({
      from: fc.nat(pool.length - 1),
      edit: fc.constantFrom(
        "none",
        "state",
        "slot",
        "today",
        "drop",
        "reorder",
      ),
      at: fc.nat(40),
    })
    .map(({ from, edit, at }): PlanSnapshot => {
      const s = copy(pool[from] as PlanSnapshot);
      const p = s.placements[at % s.placements.length];
      if (edit === "state" && p)
        p.state = p.state === "planned" ? "taught" : "planned";
      if (edit === "slot" && p) p.slotKey = `${p.slotKey}x`;
      if (edit === "today") s.today = "2026-11-10";
      if (edit === "drop") s.placements.splice(at % s.placements.length, 1);
      if (edit === "reorder") s.placements.reverse();
      return s;
    });

  test("snapshotKey is equal exactly when snapshots are deep-equal", () =>
    fc.assert(
      fc.property(variant, variant, (a, b) => {
        expect(snapshotKey(a) === snapshotKey(b)).toBe(isDeepStrictEqual(a, b));
        expect(snapshotKey(a)).toBe(snapshotKey(copy(a)));
      }),
      { numRuns: 100 },
    ));
});
