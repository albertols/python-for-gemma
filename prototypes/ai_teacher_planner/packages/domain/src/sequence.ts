import type { TeachingBlock } from "./calendar.ts";
import { daysBetween, type IsoDate } from "./dates.ts";
import { expandLessons, type Lesson, type LessonId } from "./lessons.ts";
import type {
  AssessmentPlacement,
  Checkpoint,
  Conflict,
  Merge,
  Overflow,
  Placement,
  PlanInputs,
  PlanSnapshot,
} from "./plan.ts";
import type { SowItem } from "./scheme.ts";
import { bySlotOrder, type Slot, type SlotKey } from "./slots.ts";
import type { Group } from "./timetable.ts";

/** A dated assessment is anchored at most this many days after its date. */
const ANCHOR_WINDOW_DAYS = 7;
/** Used when a plan has no checkpoint at all (no teaching blocks). */
const NO_CHECKPOINT = "cp:end";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: { id: string }, b: { id: string }) => cmp(a.id, b.id);
const byOrder = (a: SowItem, b: SowItem) =>
  a.order - b.order || cmp(a.id, b.id);

/** What one group's planning adds to the snapshot. */
interface GroupPlan {
  placements: Placement[];
  assessments: AssessmentPlacement[];
  overflow: Overflow[];
  conflicts: Conflict[];
}

const isUsable = (s: Slot, today: IsoDate) =>
  (s.status === "open" || s.status === "cover") && s.date >= today;

/** Lessons already behind her: everything before her position, and whole items marked done. */
function declaredLessons(
  lessons: readonly Lesson[],
  position: PlanInputs["positions"][number] | undefined,
): Set<LessonId> {
  const declared = new Set<LessonId>();
  if (!position) return declared;
  if (position.nextLessonId === null)
    for (const l of lessons) declared.add(l.id);
  else {
    const at = lessons.findIndex((l) => l.id === position.nextLessonId);
    for (const l of lessons.slice(0, Math.max(at, 0))) declared.add(l.id);
  }
  const done = new Set(position.doneItemIds);
  for (const l of lessons) if (done.has(l.itemId)) declared.add(l.id);
  return declared;
}

/** Merges that can be honoured: both lessons are in the stream and neither is in another merge. */
function usableMerges(
  merges: readonly Merge[],
  inStream: ReadonlySet<LessonId>,
): Map<LessonId, LessonId> {
  const secondOf = new Map<LessonId, LessonId>();
  const used = new Set<LessonId>();
  for (const m of [...merges].sort(byId)) {
    if (m.first === m.second) continue;
    if (!inStream.has(m.first) || !inStream.has(m.second)) continue;
    if (used.has(m.first) || used.has(m.second)) continue;
    used.add(m.first);
    used.add(m.second);
    secondOf.set(m.first, m.second);
  }
  return secondOf;
}

type Entry =
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "marker"; item: SowItem; use: "whole" | "in-lesson" };

function sequenceGroup(
  g: Group,
  inputs: PlanInputs,
  checkpointId: string,
): GroupPlan {
  const out: GroupPlan = {
    placements: [],
    assessments: [],
    overflow: [],
    conflicts: [],
  };
  const { today } = inputs;
  const lessons = expandLessons(inputs.items, inputs.overrides, g.id, g.track);
  const position = inputs.positions.find((p) => p.groupId === g.id);
  const declared = declaredLessons(lessons, position);
  const doneItems = new Set(position?.doneItemIds ?? []);
  const usable = inputs.slots
    .filter((s) => s.groupId === g.id && isUsable(s, today))
    .sort(bySlotOrder);
  const usableByKey = new Map(usable.map((s) => [s.key, s]));
  const reserved = new Set<SlotKey>();
  const wholeReserved = new Set<SlotKey>();
  const place = (
    lessonId: LessonId,
    slot: Slot,
    extra: Partial<Placement> = {},
  ) =>
    out.placements.push({
      groupId: g.id,
      lessonId,
      slotKey: slot.key,
      state: "planned",
      pinned: false,
      mergedInto: null,
      viaCover: slot.status === "cover",
      ...extra,
    });

  for (const l of lessons)
    if (declared.has(l.id))
      out.placements.push({
        groupId: g.id,
        lessonId: l.id,
        slotKey: null,
        state: "declared",
        pinned: false,
        mergedInto: null,
        viaCover: false,
      });

  // Slot pins fix a lesson; one that cannot be honoured is a conflict and the lesson stays in the stream.
  const undeclared = new Set(
    lessons.filter((l) => !declared.has(l.id)).map((l) => l.id),
  );
  const pinnedLessons = new Set<LessonId>();
  const slotPins = inputs.pins
    .filter((p) => p.groupId === g.id && p.kind === "slot")
    .sort(byId);
  for (const pin of slotPins) {
    if (pin.kind !== "slot" || !undeclared.has(pin.lessonId)) continue;
    const slot = usableByKey.get(pin.slotKey);
    if (!slot || reserved.has(slot.key) || pinnedLessons.has(pin.lessonId)) {
      out.conflicts.push({
        kind: "pin-slot-unavailable",
        pinId: pin.id,
        groupId: g.id,
        lessonId: pin.lessonId,
        slotKey: pin.slotKey,
      });
      continue;
    }
    reserved.add(slot.key);
    pinnedLessons.add(pin.lessonId);
    place(pin.lessonId, slot, { pinned: true });
  }

  const stream = lessons.filter(
    (l) => undeclared.has(l.id) && !pinnedLessons.has(l.id),
  );
  const secondOf = usableMerges(
    inputs.merges.filter((m) => m.groupId === g.id),
    new Set(stream.map((l) => l.id)),
  );
  const seconds = new Set(secondOf.values());

  // Assessments: dated ones are anchored now; undated ones wait for their place in the stream.
  const assessmentItems = inputs.items
    .filter(
      (i) =>
        i.kind === "assessment" &&
        i.assessment !== null &&
        i.assessment.status === "planned" &&
        i.track === g.track &&
        !doneItems.has(i.id),
    )
    .sort(byOrder);
  const markers = new Map<string, "whole" | "in-lesson">();
  for (const item of assessmentItems) {
    const spec = item.assessment;
    if (!spec) continue;
    if (spec.date === null) {
      markers.set(item.id, spec.slotUse);
      continue;
    }
    const date = spec.date;
    const noSlot = () =>
      out.conflicts.push({
        kind: "assessment-no-slot",
        groupId: g.id,
        itemId: item.id,
        date,
      });
    if (date < today) {
      noSlot();
      continue;
    }
    const slot = usable.find(
      (s) =>
        s.date >= date &&
        (spec.slotUse === "in-lesson"
          ? !wholeReserved.has(s.key)
          : !reserved.has(s.key)),
    );
    if (!slot || daysBetween(date, slot.date) > ANCHOR_WINDOW_DAYS) {
      noSlot();
      continue;
    }
    out.assessments.push({
      groupId: g.id,
      itemId: item.id,
      slotKey: slot.key,
      slotUse: spec.slotUse,
    });
    if (spec.slotUse === "whole") {
      reserved.add(slot.key);
      wholeReserved.add(slot.key);
    }
  }

  // The stream, in scheme order, with undated assessments where the scheme puts them.
  const entries: Entry[] = [];
  const itemsInOrder = inputs.items
    .filter((i) => i.track === g.track)
    .sort(byOrder);
  const streamIds = new Set(stream.map((l) => l.id));
  let lessonsBefore = 0;
  let undeclaredBefore = 0;
  for (const item of itemsInOrder) {
    if (item.kind === "assessment") {
      const use = markers.get(item.id);
      // Everything before it is already taught: it is behind her, not ahead.
      if (use && (lessonsBefore === 0 || undeclaredBefore > 0))
        entries.push({ kind: "marker", item, use });
      continue;
    }
    for (const l of lessons.filter((x) => x.itemId === item.id)) {
      lessonsBefore++;
      if (!declared.has(l.id)) undeclaredBefore++;
      if (streamIds.has(l.id) && !seconds.has(l.id))
        entries.push({ kind: "lesson", lesson: l });
    }
  }

  const free = usable.filter((s) => !reserved.has(s.key));
  let cursor = 0;
  let lastSlot: Slot | null = null;
  const waiting: SowItem[] = [];
  const overflowIds: LessonId[] = [];
  const noSlotToday = (item: SowItem) =>
    out.conflicts.push({
      kind: "assessment-no-slot",
      groupId: g.id,
      itemId: item.id,
      date: today,
    });
  for (const e of entries) {
    const slot = free[cursor];
    if (e.kind === "lesson") {
      const second = secondOf.get(e.lesson.id);
      if (!slot) {
        overflowIds.push(e.lesson.id);
        if (second) overflowIds.push(second);
        continue;
      }
      cursor++;
      place(e.lesson.id, slot);
      if (second) place(second, slot, { mergedInto: e.lesson.id });
      lastSlot = slot;
      for (const item of waiting.splice(0))
        out.assessments.push({
          groupId: g.id,
          itemId: item.id,
          slotKey: slot.key,
          slotUse: "in-lesson",
        });
    } else if (e.use === "whole") {
      if (!slot) {
        noSlotToday(e.item);
        continue;
      }
      cursor++;
      out.assessments.push({
        groupId: g.id,
        itemId: e.item.id,
        slotKey: slot.key,
        slotUse: "whole",
      });
    } else if (lastSlot) {
      out.assessments.push({
        groupId: g.id,
        itemId: e.item.id,
        slotKey: lastSlot.key,
        slotUse: "in-lesson",
      });
    } else waiting.push(e.item);
  }
  for (const item of waiting) noSlotToday(item);

  // Not-after deadlines are checked against where the lessons landed; nothing is reordered for them.
  const dateOf = new Map<LessonId, IsoDate>();
  for (const p of out.placements) {
    const slot = p.slotKey ? usableByKey.get(p.slotKey) : undefined;
    if (slot) dateOf.set(p.lessonId, slot.date);
  }
  const notAfter = inputs.pins
    .filter((p) => p.groupId === g.id && p.kind === "not-after")
    .sort(byId);
  for (const pin of notAfter) {
    if (pin.kind !== "not-after" || !undeclared.has(pin.lessonId)) continue;
    const plannedDate = dateOf.get(pin.lessonId) ?? null;
    if (plannedDate === null || plannedDate > pin.date)
      out.conflicts.push({
        kind: "not-after-missed",
        pinId: pin.id,
        groupId: g.id,
        lessonId: pin.lessonId,
        date: pin.date,
        plannedDate,
      });
  }

  // What is left: slots become spare lessons, lessons become overflow.
  for (const [i, slot] of free.slice(cursor).entries())
    place(`flex:${g.id}:${checkpointId}#${i + 1}`, slot);
  if (overflowIds.length > 0)
    out.overflow.push({
      checkpointId,
      groupId: g.id,
      lessonIds: overflowIds,
    });
  return out;
}

function checkpointsOf(
  items: readonly SowItem[],
  blocks: readonly TeachingBlock[],
  today: IsoDate,
): Checkpoint[] {
  const cps: Checkpoint[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    const a = i.assessment;
    if (!a || a.date === null || a.status !== "planned" || a.date < today)
      continue;
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    cps.push({
      id: `cp:${i.id}`,
      kind: "assessment",
      date: a.date,
      label: i.title === "" ? i.id : i.title,
      itemId: i.id,
    });
  }
  for (const b of blocks)
    if (b.to >= today)
      cps.push({
        id: `cp:block:${b.id}`,
        kind: "block-end",
        date: b.to,
        label: `End of block ${b.id}`,
        itemId: null,
      });
  return cps.sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));
}

const conflictKey = (c: Conflict): string[] => [
  c.groupId,
  c.kind,
  "itemId" in c ? c.itemId : "",
  "lessonId" in c ? c.lessonId : "",
  "pinId" in c ? c.pinId : "",
];
const byKeys = (a: string[], b: string[]) => {
  for (let i = 0; i < a.length; i++) {
    const d = cmp(a[i] ?? "", b[i] ?? "");
    if (d !== 0) return d;
  }
  return 0;
};

/**
 * Places each group's lessons, in scheme order, into its own earliest usable
 * slots, around dated assessments and slot pins. No pace line, no history: those
 * come later. The output does not depend on the order of the input arrays.
 */
export function sequence(inputs: PlanInputs): PlanSnapshot {
  const checkpoints = checkpointsOf(inputs.items, inputs.blocks, inputs.today);
  const checkpointId = checkpoints.at(-1)?.id ?? NO_CHECKPOINT;
  const plans = [...inputs.groups]
    .filter((g) => g.courseId === inputs.courseId)
    .sort(byId)
    .map((g) => sequenceGroup(g, inputs, checkpointId));
  return {
    courseId: inputs.courseId,
    today: inputs.today,
    placements: plans
      .flatMap((p) => p.placements)
      .sort(
        (a, b) =>
          cmp(a.groupId, b.groupId) ||
          cmp(a.slotKey ?? "", b.slotKey ?? "") ||
          cmp(a.lessonId, b.lessonId),
      ),
    assessments: plans
      .flatMap((p) => p.assessments)
      .sort((a, b) => cmp(a.groupId, b.groupId) || cmp(a.itemId, b.itemId)),
    checkpoints,
    overflow: plans
      .flatMap((p) => p.overflow)
      .sort(
        (a, b) =>
          cmp(a.groupId, b.groupId) || cmp(a.checkpointId, b.checkpointId),
      ),
    absorbed: [],
    conflicts: plans
      .flatMap((p) => p.conflicts)
      .sort((a, b) => byKeys(conflictKey(a), conflictKey(b))),
  };
}
