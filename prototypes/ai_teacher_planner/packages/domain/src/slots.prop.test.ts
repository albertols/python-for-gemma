import {
  SEED_GROUPS,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { toCalendarDays } from "./calendar.ts";
import { addDays, eachDay, mondayOf, weekdayOf } from "./dates.ts";
import { buildSlots, type Disruption } from "./slots.ts";
import { lessonsPerFortnight, type Period } from "./timetable.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const firstDate = days[0]?.date ?? "2026-09-01";
const lastDate = days[days.length - 1]?.date ?? "2027-06-30";
const span = eachDay(firstDate, lastDate);
const build = (disruptions: readonly Disruption[]) =>
  buildSlots({
    days,
    timetables: [SEED_TIMETABLE],
    groups: SEED_GROUPS,
    disruptions,
  });
const base = build([]);

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

const period = fc.constantFrom<Period>(1, 2, 3, 4, 5, 6);
const disruptionArb: fc.Arbitrary<Disruption> = fc
  .record({
    id: fc.stringMatching(/^d[0-9]{1,3}$/),
    scope: fc.oneof(
      fc.constant({ kind: "school" as const }),
      fc.constant({ kind: "teacher" as const }),
      fc.constantFrom(11, 12, 13).map((yearGroup) => ({
        kind: "year" as const,
        yearGroup: yearGroup as 11 | 12 | 13,
      })),
      fc.constantFrom(...SEED_GROUPS.map((g) => g.id)).map((groupId) => ({
        kind: "group" as const,
        groupId,
      })),
    ),
    from: fc.constantFrom(...span),
    length: fc.integer({ min: 0, max: 10 }),
    periods: fc.option(fc.uniqueArray(period, { maxLength: 4 }), {
      nil: null,
    }),
    effect: fc.constantFrom("cancelled" as const, "cover" as const),
    reason: fc.constantFrom("Snow", "Trip", "Absent"),
    source: fc.constantFrom("calendar" as const, "teacher" as const),
  })
  .map(({ length, ...d }) => ({ ...d, to: addDays(d.from, length) }));

const fullWeeks = [...new Set(days.map((d) => mondayOf(d.date)))].filter(
  (monday) =>
    [0, 1, 2, 3, 4].every(
      (i) => days.find((d) => d.date === addDays(monday, i))?.pupilDay,
    ),
);
const keysOf = (s: readonly { key: string }[]) => s.map((x) => x.key);

describe("slot invariants", () => {
  test("there is at least one full pupil week to test", () =>
    expect(fullWeeks.length).toBeGreaterThan(10));

  test("no slot falls on a day that is not a pupil day", () => {
    const pupil = new Set(days.filter((d) => d.pupilDay).map((d) => d.date));
    expect(base.every((s) => pupil.has(s.date) && weekdayOf(s.date) < 6)).toBe(
      true,
    );
  });

  test("an undisrupted full week gives each group its timetable count", () => {
    const perFortnight = lessonsPerFortnight(SEED_TIMETABLE);
    fc.assert(
      fc.property(fc.constantFrom(...fullWeeks), (monday) => {
        const label = days.find((d) => d.date === monday)?.weekLabel;
        expect(label).toBeTruthy();
        for (const g of SEED_GROUPS) {
          const count = base.filter(
            (s) =>
              s.groupId === g.id &&
              s.date >= monday &&
              s.date <= addDays(monday, 4),
          ).length;
          expect(count).toBe(perFortnight[g.id]?.[label ?? "W1"]);
        }
      }),
    );
  });

  test("adding a disruption never changes the set of slot keys", () =>
    fc.assert(
      fc.property(fc.array(disruptionArb, { maxLength: 6 }), (ds) => {
        expect(keysOf(build(ds))).toEqual(keysOf(base));
      }),
    ));

  test("shuffling the disruptions never changes the result", () =>
    fc.assert(
      fc.property(
        fc.array(disruptionArb, { maxLength: 8 }),
        fc.integer({ min: 0, max: 1000 }),
        (ds, seed) => {
          expect(build(shuffle(ds, seed))).toEqual(build(ds));
        },
      ),
    ));

  test("shuffling days, groups and timetable entries never changes the result", () =>
    fc.assert(
      fc.property(
        fc.array(disruptionArb, { maxLength: 4 }),
        fc.integer({ min: 0, max: 1000 }),
        (ds, seed) => {
          const shuffled = buildSlots({
            days: shuffle(days, seed),
            timetables: [
              {
                ...SEED_TIMETABLE,
                entries: shuffle(SEED_TIMETABLE.entries, seed + 1),
                duties: shuffle(SEED_TIMETABLE.duties, seed + 2),
              },
            ],
            groups: shuffle(SEED_GROUPS, seed + 3),
            disruptions: shuffle(ds, seed + 4),
          });
          expect(shuffled).toEqual(build(ds));
        },
      ),
    ));
});
