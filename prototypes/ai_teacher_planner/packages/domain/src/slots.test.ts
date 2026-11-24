import {
  SEED_GROUPS,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { expect, test } from "vitest";
import { toCalendarDays } from "./calendar.ts";
import { buildSlots, bySlotOrder, type Disruption, slotKey } from "./slots.ts";
import type { TimetableVersion } from "./timetable.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const build = (disruptions: Disruption[] = []) =>
  buildSlots({
    days,
    timetables: [SEED_TIMETABLE],
    groups: SEED_GROUPS,
    disruptions,
  });
const slots = build();
const slot = (key: string) => slots.find((s) => s.key === key);
const disruption = (over: Partial<Disruption>): Disruption => ({
  id: "d1",
  scope: { kind: "school" },
  from: "2026-11-19",
  to: "2026-11-19",
  periods: null,
  effect: "cancelled",
  reason: "Snow",
  source: "teacher",
  ...over,
});
const on = (s: ReturnType<typeof build>, date: string) =>
  s.filter((x) => x.date === date);

test("a slot key is group, date and period", () =>
  expect(slotKey("13 1", "2027-01-08", 6)).toBe("13 1|2027-01-08|6"));

test("a double is two joined units; periods 2 and 3 never join", () => {
  expect(slot("13 3|2026-11-19|3")?.doubleWith).toBe("13 3|2026-11-19|4");
  expect(slot("13 3|2026-11-19|4")?.doubleWith).toBe("13 3|2026-11-19|3");
  expect(slot("13 5|2026-11-24|2")?.doubleWith).toBeNull();
  expect(slot("IB S|2026-11-19|1")?.doubleWith).toBe("IB S|2026-11-19|2");
  expect(slot("IB S|2026-11-19|2")?.doubleWith).toBe("IB S|2026-11-19|1");
});

test("a slot carries its room and week label", () => {
  expect(slot("13 3|2026-11-19|3")).toMatchObject({
    room: "202",
    weekLabel: "W1",
    status: "open",
    reasons: [],
  });
});

test("a school closure cancels every group's slots that day and keeps the reason", () => {
  const s = build([disruption({})]);
  const thatDay = on(s, "2026-11-19");
  expect(thatDay).toHaveLength(5);
  expect(
    thatDay.every(
      (x) => x.status === "cancelled" && x.reasons[0]?.text === "Snow",
    ),
  ).toBe(true);
  expect(thatDay[0]?.reasons[0]).toEqual({
    disruptionId: "d1",
    text: "Snow",
    source: "teacher",
  });
  expect(on(s, "2026-11-20").every((x) => x.status === "open")).toBe(true);
});

test("a year-group event touches only that year", () => {
  const s = build([disruption({ scope: { kind: "year", yearGroup: 13 } })]);
  const status = (k: string) => s.find((x) => x.key === k)?.status;
  expect(status("13 3|2026-11-19|3")).toBe("cancelled");
  expect(status("13 3|2026-11-19|4")).toBe("cancelled");
  expect(status("13 5|2026-11-19|6")).toBe("cancelled");
  expect(status("IB S|2026-11-19|1")).toBe("open");
});

test("a group event touches only that group", () => {
  const s = build([disruption({ scope: { kind: "group", groupId: "13 3" } })]);
  expect(on(s, "2026-11-19").map((x) => x.status)).toEqual([
    "open",
    "open",
    "cancelled",
    "cancelled",
    "open",
  ]);
});

test("an absence gives cover, and cancelled wins over cover", () => {
  const s = build([
    disruption({
      id: "a1",
      scope: { kind: "teacher" },
      effect: "cover",
      reason: "Absent",
    }),
    disruption({ id: "c1", periods: [3], reason: "Trip" }),
  ]);
  const thatDay = on(s, "2026-11-19");
  expect(thatDay.find((x) => x.period === 1)?.status).toBe("cover");
  const p3 = thatDay.find((x) => x.period === 3);
  expect(p3?.status).toBe("cancelled");
  expect(p3?.reasons.map((r) => r.disruptionId)).toEqual(["a1", "c1"]);
});

test("a periods list limits the disruption", () => {
  const s = build([disruption({ periods: [3] })]);
  const status = (k: string) => s.find((x) => x.key === k)?.status;
  expect(status("13 3|2026-11-19|3")).toBe("cancelled");
  expect(status("13 3|2026-11-19|4")).toBe("open");
});

test("a later timetable version applies from its date only", () => {
  const v2: TimetableVersion = {
    ...SEED_TIMETABLE,
    id: "v2",
    validFrom: "2027-01-08",
    entries: SEED_TIMETABLE.entries.map((e) =>
      e.groupId === "13 1" && e.weekday === 5 ? { ...e, period: 5 } : e,
    ),
  };
  const s = buildSlots({
    days,
    timetables: [v2, SEED_TIMETABLE],
    groups: SEED_GROUPS,
    disruptions: [],
  });
  const keys = new Set(s.map((x) => x.key));
  expect(keys.has("13 1|2026-11-20|6")).toBe(true);
  expect(keys.has("13 1|2026-11-20|5")).toBe(false);
  expect(keys.has("13 1|2027-01-08|5")).toBe(true);
  expect(keys.has("13 1|2027-01-08|6")).toBe(false);
});

test("slots are sorted by date, then period, then group", () => {
  expect(slots.length).toBeGreaterThan(100);
  expect(slots).toEqual([...slots].sort(bySlotOrder));
  expect(on(slots, "2026-11-19").map((x) => x.key)).toEqual([
    "IB S|2026-11-19|1",
    "IB S|2026-11-19|2",
    "13 3|2026-11-19|3",
    "13 3|2026-11-19|4",
    "13 5|2026-11-19|6",
  ]);
});

test("the output does not depend on input order", () => {
  const reversed = buildSlots({
    days: [...days].reverse(),
    timetables: [SEED_TIMETABLE],
    groups: [...SEED_GROUPS].reverse(),
    disruptions: [],
  });
  expect(reversed).toEqual(slots);
});
