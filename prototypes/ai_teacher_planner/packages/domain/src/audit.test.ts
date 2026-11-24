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
