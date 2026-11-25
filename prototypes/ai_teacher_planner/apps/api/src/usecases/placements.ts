import {
  type AssessmentPlacement,
  type CourseId,
  ENGINE,
  type IsoDate,
  lessonsFor,
  type Placement,
  type Provenance,
  type SowItem,
} from "@planner/domain";
import type { Repos } from "../repos/ports.ts";

export type PlacementView = Placement & {
  courseId: CourseId;
  date: IsoDate;
  period: number;
  /** Null for a spare lesson. */
  itemId: string | null;
  index: number | null;
  of: number | null;
  title: string;
  kind: SowItem["kind"] | "flex";
  provenance: Provenance;
};
export type AssessmentView = AssessmentPlacement & {
  courseId: CourseId;
  date: IsoDate;
  period: number;
  title: string;
  provenance: Provenance;
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const partsOf = (slotKey: string) => {
  const [, date = "", period = "0"] = slotKey.split("|");
  return { date, period: Number(period) };
};

/**
 * What every plan's head puts in the days from `from` to `to`, for the board:
 * each lesson with its title, kind and provenance from the scheme (a spare
 * lesson is the engine's, titled by her edit or "Spare lesson"), and each
 * assessment. States are the head's own: nothing moves until she accepts.
 */
export function placementsIn(
  repos: Repos,
  from: IsoDate,
  to: IsoDate,
): { placements: PlacementView[]; assessments: AssessmentView[] } {
  const placements: PlacementView[] = [];
  const assessments: AssessmentView[] = [];
  for (const head of repos.plans.heads()) {
    const courseId = head.planId;
    const items = new Map(repos.scheme.items(courseId).map((i) => [i.id, i]));
    const overrides = repos.scheme.overrides(courseId);
    const flexTitles = new Map(
      repos.decisions
        .forCourse(courseId)
        .flexEdits.map((e) => [e.flexId, e.title]),
    );
    for (const p of head.snapshot.placements) {
      if (p.slotKey === null) continue;
      const { date, period } = partsOf(p.slotKey);
      if (date < from || date > to) continue;
      if (p.lessonId.startsWith("flex:")) {
        placements.push({
          ...p,
          courseId,
          date,
          period,
          itemId: null,
          index: null,
          of: null,
          title: flexTitles.get(p.lessonId) ?? "Spare lesson",
          kind: "flex",
          provenance: ENGINE,
        });
        continue;
      }
      const [itemId = "", n = "0"] = p.lessonId.split("#");
      const item = items.get(itemId);
      placements.push({
        ...p,
        courseId,
        date,
        period,
        itemId,
        index: Number(n),
        of: item ? lessonsFor(item, overrides, p.groupId) : null,
        // an item taken out of the scheme after the plan was accepted keeps its id
        title: item?.title ?? itemId,
        kind: item?.kind ?? "teaching",
        provenance: item?.provenance ?? ENGINE,
      });
    }
    for (const a of head.snapshot.assessments) {
      const { date, period } = partsOf(a.slotKey);
      if (date < from || date > to) continue;
      const item = items.get(a.itemId);
      assessments.push({
        ...a,
        courseId,
        date,
        period,
        title: item?.title ?? a.itemId,
        provenance: item?.provenance ?? ENGINE,
      });
    }
  }
  const bySlot = (
    a: { date: string; period: number; groupId: string },
    b: { date: string; period: number; groupId: string },
  ) => cmp(a.date, b.date) || a.period - b.period || cmp(a.groupId, b.groupId);
  placements.sort((a, b) => bySlot(a, b) || cmp(a.lessonId, b.lessonId));
  assessments.sort((a, b) => bySlot(a, b) || cmp(a.itemId, b.itemId));
  return { placements, assessments };
}
