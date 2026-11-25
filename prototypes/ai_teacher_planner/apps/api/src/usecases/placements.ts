import {
  type AssessmentPlacement,
  type CourseId,
  ENGINE,
  type FlexEdit,
  type GroupId,
  type IsoDate,
  type LessonLogEntry,
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
  /** What she said a spare lesson is for; null for a content lesson or a spare one she did not edit. */
  purpose: FlexEdit["purpose"];
};
export type AssessmentView = AssessmentPlacement & {
  courseId: CourseId;
  date: IsoDate;
  period: number;
  title: string;
  provenance: Provenance;
};
/**
 * The topics a group's position declares as taught before the day she gave it
 * (the lessons before her "next lesson", and the items done out of order). The
 * board draws them as one band before that day, never as dated lessons.
 */
export interface DeclaredView {
  courseId: CourseId;
  groupId: GroupId;
  /** The day she gave the position (`Position.asOf`). */
  before: IsoDate;
  /** Item titles, in scheme order. */
  topics: string[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const partsOf = (slotKey: string) => {
  const [, date = "", period = "0"] = slotKey.split("|");
  return { date, period: Number(period) };
};

/**
 * The latest log entry that points at each past placement, keyed by group,
 * lesson and slot. An entry with a slot points at that slot; one without points
 * at the lesson's latest placement dated on or before the day she recorded it.
 */
function loggedOutcomes(
  log: readonly LessonLogEntry[],
  placements: readonly Placement[],
): Map<string, LessonLogEntry["outcome"]> {
  const key = (groupId: string, lessonId: string, slotKey: string) =>
    `${groupId}\u0000${lessonId}\u0000${slotKey}`;
  const out = new Map<string, LessonLogEntry["outcome"]>();
  // oldest first (stable, so the order recorded breaks ties): a later answer wins
  const ordered = [...log].sort((a, b) => cmp(a.recordedOn, b.recordedOn));
  for (const e of ordered) {
    let slotKey = e.slotKey;
    if (slotKey === null)
      slotKey =
        placements
          .filter(
            (p) =>
              p.groupId === e.groupId &&
              p.lessonId === e.lessonId &&
              p.slotKey !== null &&
              partsOf(p.slotKey).date <= e.recordedOn,
          )
          .map((p) => p.slotKey as string)
          .sort((a, b) => cmp(partsOf(a).date, partsOf(b).date))
          .at(-1) ?? null;
    if (slotKey !== null)
      out.set(key(e.groupId, e.lessonId, slotKey), e.outcome);
  }
  return out;
}

/**
 * What every plan's head puts in the days from `from` to `to`, for the board:
 * each lesson with its title, kind and provenance from the scheme (a spare
 * lesson is the engine's, titled by her edit or "Spare lesson"), and each
 * assessment. The head is never changed; only the state shown is worked out:
 * her logged outcome first, then a history state as stored, then `assumed` for
 * a lesson still `planned` on a day before `today`. A past spare lesson she did
 * not edit is not shown (a new plan drops it); one she edited shows as assumed.
 */
export function placementsIn(
  repos: Repos,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): {
  placements: PlacementView[];
  assessments: AssessmentView[];
  declared: DeclaredView[];
} {
  const placements: PlacementView[] = [];
  const assessments: AssessmentView[] = [];
  const declared: DeclaredView[] = [];
  for (const head of repos.plans.heads()) {
    const courseId = head.planId;
    const items = new Map(repos.scheme.items(courseId).map((i) => [i.id, i]));
    const overrides = repos.scheme.overrides(courseId);
    const flexEdits = repos.decisions.forCourse(courseId).flexEdits;
    const flexTitles = new Map(flexEdits.map((e) => [e.flexId, e.title]));
    const flexPurposes = new Map(flexEdits.map((e) => [e.flexId, e.purpose]));
    const groupIds = [
      ...new Set(head.snapshot.placements.map((p) => p.groupId)),
    ];
    const logged = loggedOutcomes(
      repos.facts.log(groupIds),
      head.snapshot.placements,
    );
    const shown = (p: Placement, date: IsoDate): Placement["state"] => {
      const outcome = logged.get(
        `${p.groupId}\u0000${p.lessonId}\u0000${p.slotKey}`,
      );
      if (outcome) return outcome;
      if (p.state === "planned" && date < today) return "assumed";
      return p.state;
    };
    for (const p of head.snapshot.placements) {
      if (p.slotKey === null) continue;
      const { date, period } = partsOf(p.slotKey);
      if (date < from || date > to) continue;
      if (p.lessonId.startsWith("flex:")) {
        if (
          date < today &&
          p.state === "planned" &&
          !flexTitles.has(p.lessonId)
        )
          continue;
        placements.push({
          ...p,
          state: shown(p, date),
          courseId,
          date,
          period,
          itemId: null,
          index: null,
          of: null,
          title: flexTitles.get(p.lessonId) ?? "Spare lesson",
          kind: "flex",
          provenance: ENGINE,
          purpose: flexPurposes.get(p.lessonId) ?? null,
        });
        continue;
      }
      const [itemId = "", n = "0"] = p.lessonId.split("#");
      const item = items.get(itemId);
      placements.push({
        ...p,
        state: shown(p, date),
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
        purpose: null,
      });
    }
    declared.push(
      ...declaredOf(head.snapshot.placements, courseId, items, repos),
    );
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
  declared.sort(
    (a, b) => cmp(a.courseId, b.courseId) || cmp(a.groupId, b.groupId),
  );
  return { placements, assessments, declared };
}

/** Each group's declared topics in one head (declared placements have no slot), dated by its position. */
function declaredOf(
  snapshot: readonly Placement[],
  courseId: CourseId,
  items: ReadonlyMap<string, SowItem>,
  repos: Repos,
): DeclaredView[] {
  const asOf = new Map(
    repos.facts.positions(courseId).map((p) => [p.groupId, p.asOf]),
  );
  const byGroup = new Map<GroupId, Set<string>>();
  for (const p of snapshot) {
    if (p.state !== "declared" || p.slotKey !== null) continue;
    const itemId = p.lessonId.split("#")[0] ?? "";
    const set = byGroup.get(p.groupId) ?? new Set<string>();
    set.add(itemId);
    byGroup.set(p.groupId, set);
  }
  const out: DeclaredView[] = [];
  for (const [groupId, itemIds] of byGroup) {
    const before = asOf.get(groupId);
    if (!before) continue;
    const order = (id: string) => items.get(id)?.order ?? Number.MAX_VALUE;
    const topics = [...itemIds]
      .sort((a, b) => order(a) - order(b) || cmp(a, b))
      .map((id) => items.get(id)?.title ?? id);
    out.push({ courseId, groupId, before, topics });
  }
  return out;
}
