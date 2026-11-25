import type { IsoDate } from "./dates.ts";
import type { LessonId } from "./lessons.ts";
import type {
  AssessmentPlacement,
  LessonLogEntry,
  Placement,
  PlacementState,
  PlanSnapshot,
} from "./plan.ts";
import type { Slot, SlotKey } from "./slots.ts";
import type { GroupId } from "./timetable.ts";

/** States that mean the lesson is behind her: it is never rewritten by a replan. */
const HISTORY: ReadonlySet<PlacementState> = new Set([
  "declared",
  "assumed",
  "taught",
  "cover",
  "homework",
  "skipped",
]);
/** History that counts as done. A skipped lesson was not taught. */
const DELIVERED: ReadonlySet<PlacementState> = new Set([
  "declared",
  "assumed",
  "taught",
  "cover",
  "homework",
]);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The date inside a slot key (`group|date|period`). Group ids never contain a bar. */
export function slotDate(key: SlotKey): IsoDate {
  return key.split("|")[1] ?? "";
}
const slotPeriod = (key: SlotKey) => Number(key.split("|")[2] ?? 0);

/** Declared, assumed, taught, cover, homework or skipped. */
export function isHistory(p: Placement): boolean {
  return HISTORY.has(p.state);
}

/** What counts as done for the group: declared, assumed, taught, cover and homework lessons. */
export function delivered(
  snapshot: PlanSnapshot,
  groupId: GroupId,
): Set<LessonId> {
  return new Set(
    snapshot.placements
      .filter((p) => p.groupId === groupId && DELIVERED.has(p.state))
      .map((p) => p.lessonId),
  );
}

/**
 * The next date after `today` with a usable (open or cover) slot in the plan.
 * Placements from today to this date are frozen. Null when there is none.
 */
export function freezeHorizonEnd(
  today: IsoDate,
  slots: readonly Slot[],
): IsoDate | null {
  let next: IsoDate | null = null;
  for (const s of slots)
    if (
      (s.status === "open" || s.status === "cover") &&
      s.date > today &&
      (next === null || s.date < next)
    )
      next = s.date;
  return next;
}

/**
 * The group's next lesson: its first planned lesson in slot order. Spare
 * lessons and the second lesson of a merged pair are not lessons of the scheme.
 */
export function nextLesson(
  snapshot: PlanSnapshot,
  groupId: GroupId,
): LessonId | null {
  const planned = snapshot.placements
    .filter(
      (p) =>
        p.groupId === groupId &&
        p.state === "planned" &&
        p.slotKey !== null &&
        p.mergedInto === null &&
        !p.lessonId.startsWith("flex:"),
    )
    .sort(
      (a, b) =>
        cmp(slotDate(a.slotKey ?? ""), slotDate(b.slotKey ?? "")) ||
        slotPeriod(a.slotKey ?? "") - slotPeriod(b.slotKey ?? "") ||
        cmp(a.lessonId, b.lessonId),
    );
  return planned[0]?.lessonId ?? null;
}

/** What the previous plan hands to one group's new plan. */
export interface Carried {
  /** Past placements, with their state settled. Never rewritten. */
  history: Placement[];
  /** Placements from today to the horizon whose slot is still usable: copied as they are. */
  frozen: Placement[];
  /** Lessons done by history: they are not planned again. */
  deliveredIds: Set<LessonId>;
  /** The previous plan's declared placements (no slot), for a group whose declared set cannot be recomputed. */
  declaredKept: Placement[];
  /** Assessments from today to the horizon on slots that are still usable: copied as they are. */
  frozenAssessments: AssessmentPlacement[];
  /**
   * Buffer lessons used up: absorbed in the previous plan at a checkpoint that is
   * now before today (or that the previous plan had already carried as used).
   * They stay absorbed and are never planned again. By lesson id.
   */
  consumed: PlanSnapshot["absorbed"];
}

/**
 * Carries one group's history and frozen placements out of the previous plan.
 *
 * - A placement dated before today is history. Its state is the log's outcome
 *   when an entry points at it, `assumed` when it was only planned, and what it
 *   already was otherwise. A log entry points at the lesson's latest placement
 *   dated on or before the entry's slot (or its recording day when it has no
 *   slot), so an old skip never lands on the lesson's later, replanned slot.
 * - A `taught` or `homework` entry for a lesson with no past placement adds one.
 * - A past spare lesson that was still only planned is dropped, unless she edited it.
 * - Placements from today to the horizon are frozen, if their slot is still usable.
 * - A buffer lesson absorbed at a checkpoint that is now past is used up (`consumed`).
 * - Declared lessons (from her position) win over any placement.
 */
export function carryHistory(args: {
  previous: PlanSnapshot | null;
  groupId: GroupId;
  today: IsoDate;
  horizonEnd: IsoDate | null;
  declared: ReadonlySet<LessonId>;
  usable: ReadonlySet<SlotKey>;
  log: readonly LessonLogEntry[];
  editedFlex: ReadonlySet<LessonId>;
}): Carried {
  const { previous, groupId, today, declared } = args;
  const out: Carried = {
    history: [],
    frozen: [],
    deliveredIds: new Set(),
    declaredKept: [],
    frozenAssessments: [],
    consumed: [],
  };
  if (previous === null) return out;

  out.declaredKept = previous.placements
    .filter(
      (p) =>
        p.groupId === groupId && p.slotKey === null && p.state === "declared",
    )
    .map((p) => ({ ...p }));
  const end = args.horizonEnd ?? "9999-12-31";
  out.frozenAssessments = previous.assessments
    .filter((a) => {
      const date = slotDate(a.slotKey);
      return (
        a.groupId === groupId &&
        date >= today &&
        date <= end &&
        args.usable.has(a.slotKey)
      );
    })
    .map((a) => ({ ...a }));

  const mine = previous.placements.filter(
    (p) =>
      p.groupId === groupId && p.slotKey !== null && !declared.has(p.lessonId),
  );
  const past = mine
    .filter((p) => slotDate(p.slotKey ?? "") < today)
    .filter(
      (p) =>
        !p.lessonId.startsWith("flex:") ||
        p.state !== "planned" ||
        args.editedFlex.has(p.lessonId),
    )
    .map(
      (p): Placement => ({
        ...p,
        state: p.state === "planned" ? "assumed" : p.state,
      }),
    )
    .sort(
      (a, b) =>
        cmp(slotDate(a.slotKey ?? ""), slotDate(b.slotKey ?? "")) ||
        cmp(a.lessonId, b.lessonId),
    );

  const entries = args.log
    .filter((e) => e.groupId === groupId && !declared.has(e.lessonId))
    // explicitly in the order written, whatever order `log` arrives in: for one
    // placement the highest `seq` wins, and `recordedOn` plays no part in it
    .sort((a, b) => a.seq - b.seq);
  const added: Placement[] = [];
  for (const e of entries) {
    const own = past.filter((p) => p.lessonId === e.lessonId);
    const bound = e.slotKey === null ? e.recordedOn : slotDate(e.slotKey);
    const before = own.filter((p) => slotDate(p.slotKey ?? "") <= bound);
    const target = before.at(-1) ?? own[0];
    if (target) target.state = e.outcome;
    else if (e.outcome === "taught" || e.outcome === "homework") {
      const was = added.find((p) => p.lessonId === e.lessonId);
      if (was) {
        was.state = e.outcome;
        was.slotKey = e.slotKey;
      } else
        added.push({
          groupId,
          lessonId: e.lessonId,
          slotKey: e.slotKey,
          state: e.outcome,
          pinned: false,
          mergedInto: null,
          viaCover: false,
        });
    }
  }
  out.history = [...past, ...added];
  for (const p of out.history)
    if (DELIVERED.has(p.state)) out.deliveredIds.add(p.lessonId);

  // A checkpoint missing from the previous plan was already past when it was made.
  const checkpointDate = new Map(
    previous.checkpoints.map((c) => [c.id, c.date]),
  );
  out.consumed = previous.absorbed
    .filter((a) => {
      if (a.groupId !== groupId) return false;
      if (declared.has(a.lessonId) || out.deliveredIds.has(a.lessonId))
        return false;
      const date = checkpointDate.get(a.checkpointId);
      return date === undefined || date < today;
    })
    .map((a) => ({ ...a }))
    .sort((a, b) => cmp(a.lessonId, b.lessonId));

  out.frozen = mine
    .filter((p) => {
      const date = slotDate(p.slotKey ?? "");
      return (
        date >= today &&
        date <= end &&
        args.usable.has(p.slotKey ?? "") &&
        !out.deliveredIds.has(p.lessonId)
      );
    })
    .map((p) => ({ ...p }));
  return out;
}
