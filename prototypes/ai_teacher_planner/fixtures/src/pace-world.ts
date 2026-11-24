import {
  buildSlots,
  type PlanInputs,
  type SowItem,
  TEACHER,
  teachingBlocks,
  toCalendarDays,
} from "@planner/domain";
import { SEED_GROUPS, SEED_TERMS, SEED_TIMETABLE } from "./seed.ts";
import { syntheticRows } from "./synthetic-calendar-model.ts";

const COURSE = "ial-business-u4";
const TODAY = "2026-11-09";
const GROUPS = ["13 1", "13 3", "13 5"];

const base: Omit<SowItem, "id" | "order" | "kind" | "lessons"> = {
  courseId: COURSE,
  title: "",
  track: "core",
  packRefs: [],
  prerequisites: [],
  availableFrom: null,
  note: null,
  assessment: null,
  provenance: TEACHER,
};
const teaching = (id: string, order: number, lessons: number): SowItem => ({
  ...base,
  id,
  order,
  kind: "teaching",
  lessons,
  title: id,
});

/**
 * The small world that Tasks 2.2 to 2.5 plan in: the synthetic year, the seed
 * timetable and the three Year 13 groups, with no disruptions. The scheme is
 * c1 (3), c2 (3), a1 (assessment on 27 Nov), c3 (4), c4 (2), and every group
 * stands at c1#1 on 9 Nov 2026. A new object each call, so a test may change it.
 */
export function paceWorld(): PlanInputs {
  const days = toCalendarDays(syntheticRows(), SEED_TERMS);
  const groups = SEED_GROUPS.filter((g) => GROUPS.includes(g.id));
  const slots = buildSlots({
    days,
    timetables: [SEED_TIMETABLE],
    groups,
    disruptions: [],
  });
  const items: SowItem[] = [
    teaching("c1", 1, 3),
    teaching("c2", 2, 3),
    {
      ...base,
      id: "a1",
      order: 3,
      kind: "assessment",
      lessons: 0,
      title: "a1",
      assessment: {
        date: "2026-11-27",
        type: "Test",
        marks: 30,
        durationMinutes: 45,
        slotUse: "whole",
        status: "planned",
        covers: ["c1", "c2"],
      },
    },
    teaching("c3", 4, 4),
    teaching("c4", 5, 2),
  ];
  return {
    courseId: COURSE,
    today: TODAY,
    groups,
    slots,
    blocks: teachingBlocks(days, SEED_TERMS),
    items,
    overrides: [],
    positions: groups.map((g) => ({
      groupId: g.id,
      nextLessonId: "c1#1",
      doneItemIds: [],
      asOf: TODAY,
    })),
    log: [],
    pins: [],
    merges: [],
    coverChoices: [],
    homework: [],
    holds: [],
    flexEdits: [],
    previous: null,
    exams: [],
    revisionWeeks: 2,
  };
}
