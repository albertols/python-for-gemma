import type { SuggestLessonCountsOutput } from "@planner/ai";
import type { CourseId } from "@planner/domain";
import { z } from "zod";
import { ApiError } from "../errors.ts";
import type { PackStore } from "../repos/ports.ts";
import {
  type AiRun,
  type ItemHandler,
  type JobContext,
  registerItemHandler,
  startJob,
} from "./ai-jobs.ts";
import { courseOrThrow, requireLockedPack } from "./plan-inputs.ts";
import { provenanceOf } from "./review-item.ts";

const SKILL = "planner-suggest-lesson-counts" as const;

/** The most lessons one chapter can be given. */
export const MAX_LESSONS = 99;

/**
 * Asks the model how many lessons each chapter of the course needs. Only titles and counts
 * are sent: no dates, group names, notes, assessments or file names. Nothing in the scheme
 * changes until she reviews a suggestion. The course id travels in the input so the items
 * know their course; the skill's own input schema drops it before the model sees anything.
 */
export function suggestCounts(
  ctx: JobContext,
  packs: PackStore,
  courseId: CourseId,
  mode: "differences" | "split" = "differences",
): AiRun {
  const course = courseOrThrow(ctx.repos, courseId);
  requireLockedPack(packs, courseId);
  const unitOf = new Map(
    (packs.locked(courseId)?.chapters ?? []).map((c) => [c.id, c.unitId]),
  );
  const teaching = ctx.repos.scheme
    .items(courseId)
    .filter((i) => i.kind === "teaching");
  const totals = new Map<string, number>();
  for (const i of teaching) {
    const unitId = i.packRefs.map((r) => unitOf.get(r)).find(Boolean) ?? "none";
    totals.set(unitId, (totals.get(unitId) ?? 0) + i.lessons);
  }
  return startJob(ctx, {
    skillId: SKILL,
    input: {
      courseId,
      courseTitle: course.title,
      mode,
      items: teaching.map((i) => ({
        id: i.id,
        title: i.title,
        lessons: i.lessons,
      })),
      unitTotals: [...totals].map(([unitId, lessons]) => ({ unitId, lessons })),
    },
    text: null,
    attachments: [],
  });
}

interface SentInput {
  courseId?: unknown;
  items?: { id: string; title: string; lessons: number | null }[];
}

/** The suggestions worth a review (the item exists, her number differs, first mention only), and how many were left out. */
function sift(output: unknown, input: unknown) {
  const { suggestions } = output as SuggestLessonCountsOutput;
  const sent = (input ?? {}) as SentInput;
  const seen = new Set<string>();
  const kept: {
    s: (typeof suggestions)[number];
    title: string;
    from: number | null;
  }[] = [];
  let dropped = 0;
  for (const s of suggestions) {
    const was = sent.items?.find((i) => i.id === s.itemId);
    if (!was || seen.has(s.itemId)) {
      dropped++;
      continue;
    }
    seen.add(s.itemId);
    if (was.lessons !== s.lessons)
      kept.push({ s, title: was.title, from: was.lessons });
  }
  return { kept, dropped };
}

const countData = z.object({ to: z.number().int().min(0).max(MAX_LESSONS) });

/** Lesson counts: each suggestion that differs from her number is an item; accepting one writes the count. */
export const lessonCountHandler: ItemHandler = {
  kind: "lesson-count",
  resource: "scheme-of-work",
  toItems(output, input) {
    const given = (input ?? {}) as SentInput;
    const courseId =
      typeof given.courseId === "string" ? (given.courseId as CourseId) : null;
    return sift(output, input).kept.map(({ s, title, from }) => ({
      target: s.itemId,
      courseId,
      data: {
        itemId: s.itemId,
        title,
        from,
        to: s.lessons,
        reason: s.reason,
        tricky: s.tricky,
      },
    }));
  },
  report(output, input) {
    const { dropped } = sift(output, input);
    if (dropped === 0) return null;
    return dropped === 1
      ? "1 suggestion was left out: it did not match a chapter of this scheme."
      : `${dropped} suggestions were left out: they did not match a chapter of this scheme.`;
  },
  async apply(item, ctx) {
    if (item.courseId === null)
      throw new ApiError(
        422,
        "no-course",
        "This suggestion does not say which course it is for, so it cannot be applied.",
      );
    const count = countData.safeParse(item.data);
    if (!count.success)
      throw new ApiError(
        422,
        "invalid-count",
        `A lesson count is a whole number from 0 to ${MAX_LESSONS}.`,
      );
    const { repos } = ctx;
    const items = repos.scheme.items(item.courseId);
    const target = items.find((i) => i.id === item.target);
    if (!target || target.kind === "assessment")
      throw new ApiError(
        422,
        "no-such-item",
        "This chapter is not in the scheme any more, so its count cannot be changed.",
      );
    const provenance = provenanceOf(ctx, item);
    repos.scheme.replace(
      item.courseId,
      items.map((i) =>
        i.id === target.id ? { ...i, lessons: count.data.to, provenance } : i,
      ),
      repos.scheme.overrides(item.courseId),
    );
  },
};

registerItemHandler(SKILL, lessonCountHandler);
