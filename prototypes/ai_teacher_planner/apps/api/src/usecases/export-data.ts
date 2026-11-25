import type {
  CourseId,
  GroupId,
  IsoDate,
  Period,
  Provenance,
} from "@planner/domain";
import type { ExportLesson, HeldBack } from "@planner/exporters";
import type { Repos } from "../repos/ports.ts";
import { type AssessmentView, placementsIn } from "./placements.ts";
import { loadPlanning } from "./planning.ts";

/**
 * What an export is built from: the head plan's lessons and assessments in a
 * range, in the state the board shows (placementsIn works that out: her log
 * entry, then the stored state, then "assumed" for a past planned lesson), and
 * the AI items that would be in it but are waiting for her review.
 */
export interface ExportData {
  lessons: ExportLesson[];
  /** Courses that have a lesson in the range, left out or not. */
  courseIds: CourseId[];
  heldBack: HeldBack[];
}

/** "Title (3 of 4)", or the title alone for a spare lesson, an assessment or a single lesson. */
const labelled = (
  title: string,
  index: number | null,
  of: number | null,
): string =>
  index !== null && of !== null && of > 1
    ? `${title} (${index} of ${of})`
    : title;

/**
 * Items that an export would hold: AI suggestions still awaiting review whose
 * course is one of `courseIds`. An item with no course never matches, so a
 * suggestion for another course (or none) never warns about this export.
 */
function awaitingReview(
  repos: Repos,
  courseIds: readonly CourseId[],
): HeldBack[] {
  const courses = new Set(courseIds);
  return repos.ai
    .listItems({ review: "suggested" })
    .filter((i) => i.courseId !== null && courses.has(i.courseId))
    .map((item): HeldBack => {
      const run = repos.ai.getRun(item.runId);
      const provenance: Provenance = {
        origin: "ai",
        ai: {
          runId: item.runId,
          provider: run?.provider ?? "unknown",
          model: run?.model ?? "unknown",
          skillId: run?.skillId ?? "unknown",
          at: run?.startedAt ?? "",
          sources: item.sources,
          review: item.review,
        },
      };
      return { provenance };
    });
}

export function exportData(
  repos: Repos,
  args: {
    from: IsoDate;
    to: IsoDate;
    today: IsoDate;
    /** Only this group's lessons; its course is always in the export. */
    groupId?: GroupId;
  },
): ExportData | null {
  const { slots, groups } = loadPlanning(repos);
  const group = args.groupId
    ? groups.find((g) => g.id === args.groupId)
    : undefined;
  if (args.groupId && !group) return null;
  const byKey = new Map(slots.map((s) => [s.key, s]));
  const roomOf = (groupId: string, date: IsoDate, period: number) =>
    byKey.get(`${groupId}|${date}|${period}`)?.room ?? null;
  /** The other half of a double, as the timetable says (from the slots, never from adjacency). */
  const doubleOf = (groupId: string, date: IsoDate, period: number) => {
    const partner = byKey.get(`${groupId}|${date}|${period}`)?.doubleWith;
    return partner ? (Number(partner.split("|")[2]) as Period) : null;
  };
  const { placements, assessments } = placementsIn(
    repos,
    args.from,
    args.to,
    args.today,
  );
  const mine = <T extends { groupId: string }>(xs: T[]) =>
    args.groupId ? xs.filter((x) => x.groupId === args.groupId) : xs;
  const lessons: ExportLesson[] = mine(placements).map((p) => ({
    groupId: p.groupId,
    date: p.date,
    period: p.period as Period,
    room: roomOf(p.groupId, p.date, p.period),
    doubleWith: doubleOf(p.groupId, p.date, p.period),
    title: labelled(p.title, p.index, p.of),
    state: p.state,
    provenance: p.provenance,
  }));
  const asLesson = (a: AssessmentView): ExportLesson => ({
    groupId: a.groupId,
    date: a.date,
    period: a.period as Period,
    room: roomOf(a.groupId, a.date, a.period),
    doubleWith: doubleOf(a.groupId, a.date, a.period),
    title: a.title,
    state: a.date < args.today ? "assumed" : "planned",
    provenance: a.provenance,
  });
  lessons.push(...mine(assessments).map(asLesson));
  const courseIds = [
    ...new Set([
      ...mine(placements).map((p) => p.courseId),
      ...mine(assessments).map((a) => a.courseId),
      ...(group ? [group.courseId] : []),
    ]),
  ].sort();
  return { lessons, courseIds, heldBack: awaitingReview(repos, courseIds) };
}
