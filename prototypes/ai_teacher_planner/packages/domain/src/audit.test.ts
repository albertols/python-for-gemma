import {
  SEED_GROUPS,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { expect, test } from "vitest";
import { auditSlots } from "./audit.ts";
import { teachingBlocks, toCalendarDays } from "./calendar.ts";
import { buildSlots, type Disruption } from "./slots.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const blocks = teachingBlocks(days, SYNTHETIC_TERMS);
const snow: Disruption = {
  id: "snow",
  scope: { kind: "school" },
  from: "2026-11-19",
  to: "2026-11-19",
  periods: null,
  effect: "cancelled",
  reason: "Snow",
  source: "teacher",
};
const audit = (disruptions: Disruption[]) =>
  auditSlots({
    slots: buildSlots({
      days,
      timetables: [SEED_TIMETABLE],
      groups: SEED_GROUPS,
      disruptions,
    }),
    days,
    blocks,
    timetables: [SEED_TIMETABLE],
    groups: SEED_GROUPS,
    disruptions,
  });
const plain = audit([]);
const auditWithSnow = audit([snow]);

test("each block row counts open slots per group", () => {
  expect(plain.rows.map((r) => r.block.id)).toEqual(blocks.map((b) => b.id));
  expect(plain.rows[0]?.perGroup["13 1"]?.open).toBeGreaterThan(0);
  expect(Object.keys(plain.rows[0]?.perGroup ?? {}).sort()).toEqual(
    SEED_GROUPS.map((g) => g.id).sort(),
  );
});

test("cancelled and cover slots are counted apart from open ones", () => {
  const withSnow = auditWithSnow.rows.find(
    (r) => r.block.from <= "2026-11-19" && r.block.to >= "2026-11-19",
  );
  const without = plain.rows.find((r) => r.block.id === withSnow?.block.id);
  expect(withSnow?.perGroup["13 3"]).toEqual({
    open: (without?.perGroup["13 3"]?.open ?? 0) - 2,
    cancelled: 2,
    cover: 0,
  });
});

test("a day off inside a block is listed with what was lost", () =>
  expect(plain.daysOff).toContainEqual({
    date: "2026-10-12",
    text: "Official Holiday",
    wouldHaveHad: [
      { groupId: "IB H", period: 1 },
      { groupId: "IB H", period: 2 },
      { groupId: "11D", period: 3 },
      { groupId: "13 1", period: 5 },
      { groupId: "13 5", period: 6 },
    ],
  }));

test("days off are in date order and all inside a block", () => {
  const dates = plain.daysOff.map((d) => d.date);
  expect(dates).toEqual([...dates].sort());
  expect(dates.every((d) => blocks.some((b) => b.from <= d && b.to >= d))).toBe(
    true,
  );
});

test("nothing is lost when nothing is cancelled", () =>
  expect(plain.lost).toEqual([]));

test("cancelled slots are listed as lost, with their reasons", () => {
  expect(auditWithSnow.lost.length).toBe(5);
  expect(auditWithSnow.lost.map((s) => s.key)).toEqual([
    "IB S|2026-11-19|1",
    "IB S|2026-11-19|2",
    "13 3|2026-11-19|3",
    "13 3|2026-11-19|4",
    "13 5|2026-11-19|6",
  ]);
  expect(auditWithSnow.lost[0]?.reasons[0]?.text).toBe("Snow");
});

test("a labelled holiday is a day off, with what that day's own label would have had", () => {
  const off = plain.daysOff.find((d) => d.date === "2026-12-08");
  expect(off).toMatchObject({ text: "Official holiday" });
  expect(off?.wouldHaveHad.length).toBeGreaterThan(0);
  const tuesdayW2 = SEED_TIMETABLE.entries.filter(
    (e) => e.week === "W2" && e.weekday === 2,
  );
  expect(off?.wouldHaveHad).toHaveLength(tuesdayW2.length);
});
test("no slot is built on a labelled holiday", () =>
  expect(
    buildSlots({
      days,
      timetables: [SEED_TIMETABLE],
      groups: SEED_GROUPS,
      disruptions: [],
    }).filter((s) => s.date === "2026-12-08"),
  ).toEqual([]));

test("a holiday on the first day of a block is still a day off", () => {
  const edge = days.map((d) =>
    d.date === "2026-11-09"
      ? { ...d, kind: "holiday" as const, pupilDay: false }
      : d,
  );
  const edgeBlocks = teachingBlocks(edge, SYNTHETIC_TERMS);
  expect(edgeBlocks.some((b) => b.from === "2026-11-09")).toBe(false);
  const result = auditSlots({
    slots: [],
    days: edge,
    blocks: edgeBlocks,
    timetables: [SEED_TIMETABLE],
    groups: SEED_GROUPS,
  });
  const off = result.daysOff.find((d) => d.date === "2026-11-09");
  expect(off?.wouldHaveHad.length).toBeGreaterThan(0);
});
test("a week off with no pupil day lists no days off", () =>
  expect(plain.daysOff.map((d) => d.date)).not.toContain("2026-11-02"));

const trip: Disruption = {
  id: "trip",
  scope: { kind: "group", groupId: "13 3" },
  from: "2026-11-19",
  to: "2026-11-19",
  periods: [3],
  effect: "cancelled",
  reason: "Trip",
  source: "teacher",
};

test("lost lessons are grouped by reason with counts per group", () => {
  const both = audit([snow, trip]);
  // 13 3 period 3 has two reasons: it counts under each, once in the lost list.
  expect(both.lost).toHaveLength(5);
  expect(both.lostByReason).toEqual([
    { reason: "Snow", perGroup: { "IB S": 2, "13 3": 2, "13 5": 1 } },
    { reason: "Trip", perGroup: { "13 3": 1 } },
  ]);
});
test("reasons are sorted by their total, largest first, then by reason", () => {
  const out = audit([
    { ...trip, id: "a", reason: "B trip", periods: null },
    { ...trip, id: "b", reason: "A trip", periods: [3] },
    snow,
  ]).lostByReason.map((r) => r.reason);
  expect(out).toEqual(["Snow", "B trip", "A trip"]);
});
test("nothing lost means no reasons", () =>
  expect(plain.lostByReason).toEqual([]));

test("lastLesson is the last open slot of each group, null when it has none", () => {
  const lastOf = (id: string) =>
    plain.rows.length === 0
      ? null
      : buildSlots({
          days,
          timetables: [SEED_TIMETABLE],
          groups: SEED_GROUPS,
          disruptions: [],
        })
          .filter((s) => s.groupId === id && s.status === "open")
          .map((s) => s.date)
          .sort()
          .at(-1);
  for (const g of SEED_GROUPS)
    expect(plain.lastLesson[g.id]).toBe(lastOf(g.id));
  const lastDay = plain.lastLesson["13 1"] as string;
  const leave = audit([
    {
      ...snow,
      id: "leave",
      scope: { kind: "year", yearGroup: 13 },
      from: "2026-12-01",
      to: "2027-12-31",
      reason: "Study leave",
    },
  ]);
  expect(
    leave.lastLesson["13 1"] && leave.lastLesson["13 1"] < "2026-12-01",
  ).toBe(true);
  expect(leave.lastLesson["13 1"]).not.toBe(lastDay);
  expect(leave.lastLesson["11D"]).toBe(plain.lastLesson["11D"]);
  const none = audit([
    { ...snow, id: "all", from: "2026-01-01", to: "2027-12-31" },
  ]);
  expect(none.lastLesson["11D"]).toBeNull();
});

test("a day off does not list a group whose lessons that day are already cancelled by another disruption", () => {
  const dayOff = "2026-12-08";
  const baseline = plain.daysOff.find((d) => d.date === dayOff);
  expect(baseline?.wouldHaveHad.some((m) => m.groupId.startsWith("13"))).toBe(
    true,
  );
  const leave: Disruption = {
    ...snow,
    id: "leave",
    scope: { kind: "year", yearGroup: 13 },
    from: "2026-12-01",
    to: "2026-12-31",
    reason: "Study leave",
  };
  const off = audit([leave]).daysOff.find((d) => d.date === dayOff);
  expect(off?.wouldHaveHad.some((m) => m.groupId.startsWith("13"))).toBe(false);
  expect(off?.wouldHaveHad.length).toBe(
    (baseline?.wouldHaveHad.length ?? 0) -
      (baseline?.wouldHaveHad.filter((m) => m.groupId.startsWith("13"))
        .length ?? 0),
  );
  // A cover lesson is not a cancellation, and a day's own "no lessons" decision is not another cause.
  const cover = audit([
    { ...leave, id: "cover", effect: "cover" },
  ]).daysOff.find((d) => d.date === dayOff);
  expect(cover?.wouldHaveHad).toEqual(baseline?.wouldHaveHad);
  const own = audit([
    { ...snow, id: `day:${dayOff}`, from: dayOff, to: dayOff },
  ]).daysOff.find((d) => d.date === dayOff);
  expect(own?.wouldHaveHad).toEqual(baseline?.wouldHaveHad);
});
