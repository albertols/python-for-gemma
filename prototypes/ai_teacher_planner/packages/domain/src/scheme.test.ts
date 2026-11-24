import { expect, test } from "vitest";
import { TEACHER } from "./provenance.ts";
import {
  type AssessmentSpec,
  defaultDuration,
  defaultSlotUse,
  extraTimeWarning,
  type GroupOverride,
  type SowItem,
  schemeTotals,
  validateScheme,
  weeksFor,
  withExtraTime,
} from "./scheme.ts";

const spec = (over: Partial<AssessmentSpec> = {}): AssessmentSpec => ({
  date: "2026-11-27",
  type: "Test",
  marks: 40,
  durationMinutes: 60,
  slotUse: "whole",
  status: "planned",
  covers: [],
  ...over,
});
const item = (id: string, over: Partial<SowItem> = {}): SowItem => ({
  id,
  courseId: "ial-business-u4",
  order: 1,
  kind: "teaching",
  title: id,
  lessons: 3,
  track: "core",
  packRefs: [],
  prerequisites: [],
  availableFrom: null,
  note: null,
  assessment: null,
  provenance: TEACHER,
  ...over,
});

test("a 12-mark IAL question takes 18 minutes and sits inside a lesson", () => {
  expect(defaultDuration("IAL", 12)).toBe(18);
  expect(defaultSlotUse(18)).toBe("in-lesson");
});

test("only IAL has a marks-to-minutes rule, and it needs the marks", () => {
  expect(defaultDuration("IAL", null)).toBeNull();
  expect(defaultDuration("IB", 12)).toBeNull();
  expect(defaultDuration("IGCSE", 12)).toBeNull();
});

// Changed after her answer to question 16 (spec appendix E): no fixed 30-minute line.
// withExtraTime(m) = floor(m * 1.25), as she counts it (30 -> 37, 55 -> 68). Whole lesson when that is over 27 (half of 55).
test("the length with 25% extra time decides the default; an unknown length takes a whole slot", () => {
  expect(withExtraTime(30)).toBe(37);
  expect(withExtraTime(55)).toBe(68);
  // withExtraTime(22) = floor(27.5) = 27, which is not over 27. Both readings of "half of 55" (27 or 27.5) agree on 22 and 23.
  expect(defaultSlotUse(23)).toBe("whole");
  expect(defaultSlotUse(22)).toBe("in-lesson");
  expect(defaultSlotUse(21)).toBe("in-lesson");
  expect(defaultSlotUse(null)).toBe("whole");
});

test("an assessment longer than the lesson with extra time carries a warning", () => {
  expect(extraTimeWarning(55)).toBe(
    "With 25% extra time this takes 68 minutes, 13 more than the lesson",
  );
  expect(extraTimeWarning(40)).toBeNull();
  expect(extraTimeWarning(null)).toBeNull();
});

test("the warning compares with the period length it is given", () => {
  expect(extraTimeWarning(40, 45)).toBe(
    "With 25% extra time this takes 50 minutes, 5 more than the lesson",
  );
});

test("totals keep teaching and assessments apart", () => {
  const items = [
    item("c1", { order: 1, lessons: 3 }),
    item("c2", { order: 2, lessons: 3 }),
    item("a1", {
      order: 3,
      kind: "assessment",
      lessons: 0,
      assessment: spec(),
    }),
    item("c3", { order: 4, lessons: 4 }),
    item("c4", { order: 5, lessons: 2 }),
  ];
  expect(schemeTotals(items, [], "13 1")).toEqual({
    teaching: 12,
    project: 0,
    revision: 0,
    buffer: 0,
    assessmentSlots: 1,
    assessmentsInLesson: 0,
  });
});

test("totals count each kind separately, and an in-lesson assessment takes no slot", () => {
  const items = [
    item("c1", { lessons: 5 }),
    item("p1", { kind: "project", lessons: 2 }),
    item("r1", { kind: "revision", lessons: 3 }),
    item("b1", { kind: "buffer", lessons: 1 }),
    item("a1", { kind: "assessment", lessons: 0, assessment: spec() }),
    item("a2", {
      kind: "assessment",
      lessons: 0,
      assessment: spec({ slotUse: "in-lesson" }),
    }),
  ];
  expect(schemeTotals(items, [], "13 1")).toEqual({
    teaching: 5,
    project: 2,
    revision: 3,
    buffer: 1,
    assessmentSlots: 1,
    assessmentsInLesson: 1,
  });
});

test("an override changes one group's totals and nobody else's", () => {
  const items = [item("c1", { lessons: 3 }), item("c2", { lessons: 4 })];
  const o: GroupOverride[] = [{ groupId: "13 3", itemId: "c2", lessons: 1 }];
  expect(schemeTotals(items, o, "13 3").teaching).toBe(4);
  expect(schemeTotals(items, o, "13 1").teaching).toBe(7);
});

test("weeksFor a six-lesson chapter in a group with six lessons a fortnight is 2", () =>
  expect(weeksFor(6, 6)).toBe(2));
test("weeksFor 4 lessons at 5 a fortnight is 1.6", () =>
  expect(weeksFor(4, 5)).toBe(1.6));
test("weeksFor rounds to one decimal place and never divides by zero", () => {
  expect(weeksFor(1, 3)).toBe(0.7);
  expect(weeksFor(4, 0)).toBe(0);
});

test("a clean scheme has nothing to report", () => {
  const items = [
    item("c1", { order: 1 }),
    item("c2", { order: 2, prerequisites: ["c1"] }),
    item("a1", {
      order: 3,
      kind: "assessment",
      lessons: 0,
      assessment: spec(),
    }),
  ];
  expect(validateScheme(items)).toEqual([]);
});

test("validateScheme refuses duplicate ids, a negative count, an assessment without a spec, and a prerequisite that does not exist", () => {
  const dup = validateScheme([item("c1"), item("c1")]);
  expect(dup).toHaveLength(1);
  expect(dup[0]).toContain("c1");
  expect(dup[0]).toMatch(/twice|duplicate|same id/i);

  const neg = validateScheme([item("c1", { lessons: -1 })]);
  expect(neg).toHaveLength(1);
  expect(neg[0]).toContain("c1");
  expect(neg[0]).toMatch(/negative|below 0|less than 0/i);

  const noSpec = validateScheme([
    item("a1", { kind: "assessment", lessons: 0 }),
  ]);
  expect(noSpec).toHaveLength(1);
  expect(noSpec[0]).toContain("a1");
  expect(noSpec[0]).toMatch(/assessment/i);

  const missing = validateScheme([item("c1", { prerequisites: ["zz"] })]);
  expect(missing).toHaveLength(1);
  expect(missing[0]).toContain("c1");
  expect(missing[0]).toContain("zz");
});
