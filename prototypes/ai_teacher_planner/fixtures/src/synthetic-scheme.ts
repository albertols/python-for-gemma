import { type CourseId, IMPORTED, type SowItem } from "@planner/domain";

/**
 * An INVENTED scheme of work, as the synthetic planning sheet and assessment
 * schedule of Task 2.13 import it: chapters ch1 to ch4 (3, 4, 4 and 2 lessons),
 * a 20-mark test on 27 Nov 2026 after ch2 (30 minutes, whole lesson) and a
 * 12-mark question on 11 Dec 2026 after ch3 (18 minutes, inside a lesson).
 * Each chapter links to the synthetic pack's chapter of the same id.
 */
export function syntheticScheme(courseId: CourseId): SowItem[] {
  const base = {
    courseId,
    track: "core" as const,
    prerequisites: [],
    availableFrom: null,
    provenance: IMPORTED,
  };
  const chapter = (
    n: number,
    order: number,
    title: string,
    lessons: number,
    note: string | null = null,
  ): SowItem => ({
    ...base,
    id: `ch${n}`,
    order,
    kind: "teaching",
    title,
    lessons,
    packRefs: [`ch${n}`],
    note,
    assessment: null,
  });
  const test = (
    after: number,
    order: number,
    date: string,
    marks: number,
    durationMinutes: number,
    slotUse: "whole" | "in-lesson",
    covers: string[],
  ): SowItem => ({
    ...base,
    id: `a-ch${after}`,
    order,
    kind: "assessment",
    title: `${marks} mark`,
    lessons: 0,
    packRefs: [],
    note: null,
    assessment: {
      date,
      type: `${marks} mark`,
      marks,
      durationMinutes,
      slotUse,
      status: "planned",
      covers,
    },
  });
  return [
    chapter(1, 1, "Demand", 3, "started last year"),
    chapter(2, 2, "Supply", 4),
    test(2, 3, "2026-11-27", 20, 30, "whole", ["ch1", "ch2"]),
    chapter(3, 4, "Markets", 4),
    test(3, 5, "2026-12-11", 12, 18, "in-lesson", ["ch3"]),
    chapter(4, 6, "Prices", 2),
  ];
}
