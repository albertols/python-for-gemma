import type { TeachingBlock } from "./calendar.ts";
import { daysBetween, type IsoDate, mondayOf } from "./dates.ts";
import type { ExternalExam } from "./exams.ts";
import { carryHistory, freezeHorizonEnd } from "./history.ts";
import { expandLessons, type Lesson, type LessonId } from "./lessons.ts";
import {
  byCheckpointOrder,
  finalContentIndex,
  planWindows,
  type StreamEntry,
  type WindowPlan,
} from "./pace.ts";
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
import type { Group, GroupId } from "./timetable.ts";

/** A dated assessment is anchored at most this many days after its date. */
const ANCHOR_WINDOW_DAYS = 7;
const REVISION_ID = "cp:revision";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: { id: string }, b: { id: string }) => cmp(a.id, b.id);
const byOrder = (a: SowItem, b: SowItem) =>
  a.order - b.order || cmp(a.id, b.id);

/** What one group's planning adds to the snapshot. */
interface GroupPlan {
  placements: Placement[];
  assessments: AssessmentPlacement[];
  overflow: Overflow[];
  absorbed: { groupId: GroupId; lessonId: LessonId }[];
  conflicts: Conflict[];
}

const isUsable = (s: Slot, today: IsoDate) =>
  (s.status === "open" || s.status === "cover") && s.date >= today;

/**
 * Lessons already behind her: everything before her position, and whole items marked done.
 * Null when her position names a lesson that is not in the scheme: we never guess where she is.
 */
function declaredLessons(
  lessons: readonly Lesson[],
  position: PlanInputs["positions"][number] | undefined,
): Set<LessonId> | null {
  const declared = new Set<LessonId>();
  if (!position) return declared;
  if (position.nextLessonId === null)
    for (const l of lessons) declared.add(l.id);
  else {
    const at = lessons.findIndex((l) => l.id === position.nextLessonId);
    if (at < 0) return null;
    for (const l of lessons.slice(0, at)) declared.add(l.id);
  }
  const done = new Set(position.doneItemIds);
  for (const l of lessons) if (done.has(l.itemId)) declared.add(l.id);
  return declared;
}

/**
 * Merges that can be honoured: both lessons are in the stream and neither is in another merge.
 * An invalid merge moves nothing, so ignoring it is safe; Task 2.12 refuses such merges on save.
 */
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

/** A group made ready for the pace line: history, anchors and pins are done; the stream is what is left. */
interface Prepared {
  group: Group;
  out: GroupPlan;
  /** Usable slots in slot order, none on or after the group's official exam. */
  usable: Slot[];
  /** Slots taken by a slot pin or a whole-slot anchor. */
  reserved: Set<SlotKey>;
  anchorOf: Map<string, Slot>;
  /** Stream entries in scheme order: lessons (merged seconds travel with their first) and undated assessments. */
  entries: Entry[];
  secondOf: Map<LessonId, LessonId>;
  known: Set<LessonId>;
  undeclared: Set<LessonId>;
  /** Every lesson id already in the group's placements; a new spare lesson never reuses one. */
  taken: Set<LessonId>;
  /** Frozen placements, by lesson: the slot each is copied on. */
  frozenAt: Map<LessonId, SlotKey>;
  /** Usable slots in the group's revision block, in slot order; empty when it has none. */
  revision: Slot[];
}

/** The day of each group's last official exam: from that day on it has no lessons. */
function examCutoffs(exams: readonly ExternalExam[]): Map<GroupId, IsoDate> {
  const out = new Map<GroupId, IsoDate>();
  for (const e of exams)
    for (const g of e.groupIds)
      if ((out.get(g) ?? "") < e.date) out.set(g, e.date);
  return out;
}

/** Steps 1 to 4 of the sequencer: declared lessons, slot pins, merges and dated anchors. */
function prepareGroup(
  g: Group,
  inputs: PlanInputs,
  cutoff: IsoDate | null,
  horizonEnd: IsoDate | null,
): Prepared | GroupPlan {
  const out: GroupPlan = {
    placements: [],
    assessments: [],
    overflow: [],
    absorbed: [],
    conflicts: [],
  };
  const { today } = inputs;
  const lessons = expandLessons(inputs.items, inputs.overrides, g.id, g.track);
  const position = inputs.positions.find((p) => p.groupId === g.id);
  const declared = declaredLessons(lessons, position);
  const usable = inputs.slots
    .filter(
      (s) =>
        s.groupId === g.id &&
        isUsable(s, today) &&
        (cutoff === null || s.date < cutoff),
    )
    .sort(bySlotOrder);
  const carried = carryHistory({
    previous: inputs.previous,
    groupId: g.id,
    today,
    horizonEnd,
    declared: declared ?? new Set(),
    usable: new Set(usable.map((s) => s.key)),
    log: inputs.log,
    editedFlex: new Set(inputs.flexEdits.map((e) => e.flexId)),
  });
  if (declared === null) {
    // Nothing new is planned, but nothing is lost either: her history, the
    // declared lessons and everything frozen stay exactly as in the previous plan.
    out.placements.push(
      ...carried.history,
      ...carried.declaredKept,
      ...carried.frozen,
    );
    out.assessments.push(...carried.frozenAssessments);
    out.conflicts.push({
      kind: "position-unknown",
      groupId: g.id,
      lessonId: position?.nextLessonId ?? "",
    });
    return out;
  }
  const doneItems = new Set(position?.doneItemIds ?? []);
  const usableByKey = new Map(usable.map((s) => [s.key, s]));
  const reserved = new Set<SlotKey>();
  const wholeReserved = new Set<SlotKey>();

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

  out.placements.push(...carried.history);
  // Today and the next teaching day are frozen: copied as they are, their slots taken.
  const frozenAt = new Map<LessonId, SlotKey>();
  for (const f of carried.frozen) {
    out.placements.push(f);
    if (f.slotKey !== null) {
      reserved.add(f.slotKey);
      frozenAt.set(f.lessonId, f.slotKey);
    }
  }

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
  const dated = assessmentItems.filter((i) => i.assessment?.date != null);
  for (const i of assessmentItems)
    if (i.assessment && i.assessment.date === null)
      markers.set(i.id, i.assessment.slotUse);
  const anchorOf = new Map<string, Slot>();
  // Assessments in the horizon are frozen like lessons: the row is copied, and a
  // whole-slot one keeps its slot so no lesson moves into it. A dated assessment
  // keeps the anchor it already had; an undated one leaves the stream.
  const datedIds = new Set(dated.map((i) => i.id));
  for (const a of carried.frozenAssessments) {
    const slot = usableByKey.get(a.slotKey);
    if (!slot || !(markers.has(a.itemId) || datedIds.has(a.itemId))) continue;
    markers.delete(a.itemId);
    if (datedIds.has(a.itemId)) anchorOf.set(a.itemId, slot);
    out.assessments.push(a);
    if (a.slotUse === "whole") {
      reserved.add(a.slotKey);
      wholeReserved.add(a.slotKey);
    }
  }
  // Slot pins fix a lesson; one that cannot be honoured is a conflict and the lesson stays in the stream.
  const undeclared = new Set(
    lessons
      .filter((l) => !declared.has(l.id) && !carried.deliveredIds.has(l.id))
      .map((l) => l.id),
  );
  const known = new Set(lessons.map((l) => l.id));
  const pinnedLessons = new Set<LessonId>();
  const slotPins = inputs.pins
    .filter((p) => p.groupId === g.id && p.kind === "slot")
    .sort(byId);
  for (const pin of slotPins) {
    if (pin.kind !== "slot") continue;
    if (!known.has(pin.lessonId)) {
      out.conflicts.push({
        kind: "pin-lesson-unknown",
        pinId: pin.id,
        groupId: g.id,
        lessonId: pin.lessonId,
        slotKey: pin.slotKey,
      });
      continue;
    }
    // A pin on a lesson already taught is moot.
    if (!undeclared.has(pin.lessonId)) continue;
    // A frozen lesson stays where it is; a pin that asks for another slot is reported as `pin-frozen`.
    const frozenSlot = frozenAt.get(pin.lessonId);
    if (frozenSlot !== undefined) {
      if (frozenSlot !== pin.slotKey)
        out.conflicts.push({
          kind: "pin-frozen",
          pinId: pin.id,
          groupId: g.id,
          lessonId: pin.lessonId,
          slotKey: pin.slotKey,
        });
      continue;
    }
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
    out.placements.push(
      placementOn(g.id, pin.lessonId, slot, { pinned: true }),
    );
  }

  // Released and skipped lessons go back in scheme order. Everything earlier in
  // the scheme is history, frozen or itself in the stream, so in practice they land first.
  const stream = lessons.filter(
    (l) =>
      undeclared.has(l.id) && !pinnedLessons.has(l.id) && !frozenAt.has(l.id),
  );
  const secondOf = usableMerges(
    inputs.merges.filter((m) => m.groupId === g.id),
    new Set(stream.map((l) => l.id)),
  );
  const seconds = new Set(secondOf.values());

  // Whole-slot anchors first, so an in-lesson anchor never lands on a slot a whole assessment takes.
  for (const use of ["whole", "in-lesson"] as const)
    for (const item of dated) {
      const spec = item.assessment;
      if (!spec || spec.date === null || spec.slotUse !== use) continue;
      if (anchorOf.has(item.id)) continue;
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
          (use === "in-lesson"
            ? !wholeReserved.has(s.key)
            : !reserved.has(s.key)),
      );
      if (!slot || daysBetween(date, slot.date) > ANCHOR_WINDOW_DAYS) {
        noSlot();
        continue;
      }
      anchorOf.set(item.id, slot);
      out.assessments.push({
        groupId: g.id,
        itemId: item.id,
        slotKey: slot.key,
        slotUse: use,
      });
      if (use === "whole") {
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
  for (const item of itemsInOrder) {
    if (item.kind === "assessment") {
      const use = markers.get(item.id);
      // Planned and undated: it is ahead of her, wherever the scheme puts it.
      if (use) entries.push({ kind: "marker", item, use });
      continue;
    }
    for (const l of lessons.filter((x) => x.itemId === item.id)) {
      if (streamIds.has(l.id) && !seconds.has(l.id))
        entries.push({ kind: "lesson", lesson: l });
    }
  }
  return {
    group: g,
    out,
    usable,
    reserved,
    anchorOf,
    entries,
    secondOf,
    known,
    undeclared,
    taken: new Set(out.placements.map((x) => x.lessonId)),
    frozenAt,
    revision: [],
  };
}

function placementOn(
  groupId: GroupId,
  lessonId: LessonId,
  slot: Slot,
  extra: Partial<Placement> = {},
): Placement {
  return {
    groupId,
    lessonId,
    slotKey: slot.key,
    state: "planned",
    pinned: false,
    mergedInto: null,
    viaCover: slot.status === "cover",
    ...extra,
  };
}

/**
 * The group's revision block (spec appendix E): the last `weeks` Monday-to-Sunday
 * weeks that hold a usable slot, counted back from its last usable slot before
 * the plan's first official exam, or its last usable slot when there is none.
 */
function revisionBlock(
  usable: readonly Slot[],
  weeks: number,
  firstExam: IsoDate | null,
): Slot[] {
  if (!(weeks >= 1)) return [];
  const before = usable.filter((s) => firstExam === null || s.date < firstExam);
  const mondays = [...new Set(before.map((s) => mondayOf(s.date)))];
  const chosen = new Set(mondays.slice(-Math.floor(weeks)));
  return before.filter((s) => chosen.has(mondayOf(s.date)));
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
  return cps;
}

/** Each official exam, once per code (ids are random), from today. */
function examCheckpoints(
  exams: readonly ExternalExam[],
  today: IsoDate,
): Checkpoint[] {
  const seen = new Set<string>();
  const out: Checkpoint[] = [];
  for (const e of [...exams].sort(
    (a, b) => cmp(a.date, b.date) || cmp(a.code, b.code) || byId(a, b),
  )) {
    if (seen.has(e.code) || e.date < today) continue;
    seen.add(e.code);
    out.push({
      id: `cp:exam:${e.code}`,
      kind: "exam",
      date: e.date,
      label: `${e.code} ${e.title}`,
      itemId: null,
    });
  }
  return out;
}

/** The first index in `usable` that is not before the checkpoint, for this group. */
function boundaryOf(p: Prepared, cp: Checkpoint): number {
  const firstFrom = (test: (s: Slot) => boolean) => {
    const i = p.usable.findIndex(test);
    return i < 0 ? p.usable.length : i;
  };
  const byDate = () => firstFrom((s) => s.date >= cp.date);
  switch (cp.kind) {
    case "assessment": {
      const anchor = cp.itemId === null ? undefined : p.anchorOf.get(cp.itemId);
      return anchor ? p.usable.indexOf(anchor) : byDate();
    }
    case "block-end":
      return firstFrom((s) => s.date > cp.date);
    case "revision": {
      const first = p.revision[0];
      return first ? p.usable.indexOf(first) : byDate();
    }
    case "exam":
      return byDate();
  }
}

/** Each checkpoint's window for one group: its free slots after the previous boundary and before this one. */
function windowsOf(
  p: Prepared,
  checkpoints: readonly Checkpoint[],
  final: number,
): Map<string, SlotKey[]> {
  const out = new Map<string, SlotKey[]>();
  const finalCp = checkpoints[final];
  const horizon = finalCp ? boundaryOf(p, finalCp) : p.usable.length;
  const block = new Set(p.revision.map((s) => s.key));
  let start = 0;
  for (const [k, cp] of checkpoints.entries()) {
    let end = Math.max(start, boundaryOf(p, cp));
    if (k <= final) end = Math.min(end, Math.max(start, horizon));
    out.set(
      cp.id,
      p.usable
        .slice(start, end)
        .filter((s) => !p.reserved.has(s.key) && !block.has(s.key))
        .map((s) => s.key),
    );
    start = end;
  }
  return out;
}

/** Plans one pace set (the groups of one track) and writes the result into each group's plan. */
function planPaceSet(
  set: Prepared[],
  track: "core" | "hl",
  inputs: PlanInputs,
  checkpoints: readonly Checkpoint[],
): void {
  const canonical = expandLessons(inputs.items, [], "", track);
  const trackItems = inputs.items
    .filter((i) => i.track === track)
    .sort(byOrder);
  const final = finalContentIndex(checkpoints);
  const windows = new Map(
    set.map((p) => [p.group.id, windowsOf(p, checkpoints, final)]),
  );
  const toStream = (e: Entry): StreamEntry | null =>
    e.kind === "lesson"
      ? e.lesson
      : e.use === "whole"
        ? { kind: "assessment", id: e.item.id, itemId: e.item.id }
        : null;
  const streams: Record<GroupId, StreamEntry[]> = {};
  for (const p of set)
    streams[p.group.id] = p.entries.flatMap((e) => toStream(e) ?? []);

  const plans: WindowPlan[] =
    checkpoints.length === 0
      ? []
      : planWindows({
          groups: set.map((p) => p.group),
          checkpoints,
          streams,
          windowSlots: (g, cp) => windows.get(g)?.get(cp.id) ?? [],
          requiredBefore: (cp) => {
            const at = trackItems.findIndex((i) => i.id === cp.itemId);
            if (cp.kind !== "assessment" || at < 0) return new Set();
            return new Set(trackItems.slice(0, at).map((i) => i.id));
          },
          canonical,
        });

  for (const p of set) {
    const g = p.group.id;
    const slotOf = new Map(p.usable.map((s) => [s.key, s]));
    const entryOf = new Map<string, Entry>();
    for (const e of p.entries)
      if (e.kind === "lesson") entryOf.set(e.lesson.id, e);
      else if (e.use === "whole") entryOf.set(e.item.id, e);
    const withSecond = (id: LessonId) => {
      const second = p.secondOf.get(id);
      return second ? [id, second] : [id];
    };
    const flexCount = new Map<string, number>();
    const flex = (checkpointId: string, slot: Slot) => {
      let n = flexCount.get(checkpointId) ?? 0;
      let id: LessonId;
      do {
        n += 1;
        id = `flex:${g}:${checkpointId}#${n}`;
      } while (p.taken.has(id));
      flexCount.set(checkpointId, n);
      p.taken.add(id);
      p.out.placements.push(placementOn(g, id, slot));
    };
    const placeEntry = (id: string, slot: Slot) => {
      const e = entryOf.get(id);
      if (!e) return;
      if (e.kind === "marker") {
        p.out.assessments.push({
          groupId: g,
          itemId: e.item.id,
          slotKey: slot.key,
          slotUse: "whole",
        });
        return;
      }
      p.out.placements.push(placementOn(g, e.lesson.id, slot));
      const second = p.secondOf.get(e.lesson.id);
      if (second)
        p.out.placements.push(
          placementOn(g, second, slot, { mergedInto: e.lesson.id }),
        );
    };

    if (checkpoints.length === 0) {
      // No checkpoint at all: the stream fills the free slots, with no spare lessons.
      const free = p.usable.filter((s) => !p.reserved.has(s.key));
      const costly = p.entries.filter((e) => toStream(e) !== null);
      for (const [i, e] of costly.entries()) {
        const slot = free[i];
        const id = e.kind === "lesson" ? e.lesson.id : e.item.id;
        if (slot) placeEntry(id, slot);
      }
      const left = costly
        .slice(free.length)
        .flatMap((e) => (e.kind === "lesson" ? withSecond(e.lesson.id) : []));
      if (left.length > 0)
        p.out.overflow.push({
          checkpointId: null,
          groupId: g,
          lessonIds: left,
        });
    }

    for (const plan of plans) {
      const w = plan.perGroup[g];
      if (!w) continue;
      const slots = w.slots.flatMap((k) => slotOf.get(k) ?? []);
      for (const [i, id] of [...w.required, ...w.broughtForward].entries()) {
        const slot = slots[i];
        if (slot) placeEntry(id, slot);
      }
      for (const slot of slots.slice(slots.length - w.spare))
        flex(plan.checkpoint.id, slot);
      for (const id of w.absorbed)
        for (const lessonId of withSecond(id))
          p.out.absorbed.push({ groupId: g, lessonId });
      const short = w.short.flatMap((id) =>
        entryOf.get(id)?.kind === "lesson" ? withSecond(id) : [],
      );
      if (short.length > 0)
        p.out.overflow.push({
          checkpointId: plan.checkpoint.id,
          groupId: g,
          lessonIds: short,
        });
    }
    // The revision block follows the spare lessons before it, under the same
    // checkpoint: the ones dated from perGroupDate on are the revision lessons.
    for (const slot of p.revision)
      if (!p.reserved.has(slot.key)) flex(REVISION_ID, slot);

    attachInLessonMarkers(p, inputs.today);
    checkNotAfter(p, inputs);
  }
}

/**
 * Undated in-lesson assessments sit in the lesson before them, or the first
 * lesson after when nothing comes before. After content that is never placed,
 * there is no lesson before them: that is a conflict.
 */
function attachInLessonMarkers(p: Prepared, today: IsoDate): void {
  const g = p.group.id;
  const slotOfLesson = new Map<LessonId, SlotKey>();
  for (const x of p.out.placements)
    if (x.slotKey !== null && !x.pinned)
      slotOfLesson.set(x.lessonId, x.slotKey);
  const placedWhole = new Set(p.out.assessments.map((a) => a.itemId));
  const noSlotToday = (item: SowItem) =>
    p.out.conflicts.push({
      kind: "assessment-no-slot",
      groupId: g,
      itemId: item.id,
      date: today,
    });
  let lastSlot: SlotKey | null = null;
  let unplaced = false;
  const waiting: SowItem[] = [];
  for (const e of p.entries) {
    if (e.kind === "lesson") {
      const slot = slotOfLesson.get(e.lesson.id);
      if (!slot) {
        unplaced = true;
        continue;
      }
      lastSlot = slot;
      for (const item of waiting.splice(0))
        p.out.assessments.push({
          groupId: g,
          itemId: item.id,
          slotKey: slot,
          slotUse: "in-lesson",
        });
    } else if (e.use === "whole") {
      if (!placedWhole.has(e.item.id)) noSlotToday(e.item);
    } else if (unplaced) noSlotToday(e.item);
    else if (lastSlot)
      p.out.assessments.push({
        groupId: g,
        itemId: e.item.id,
        slotKey: lastSlot,
        slotUse: "in-lesson",
      });
    else waiting.push(e.item);
  }
  for (const item of waiting) noSlotToday(item);
}

/** Not-after deadlines are checked against where the lessons landed; nothing is reordered for them. */
function checkNotAfter(p: Prepared, inputs: PlanInputs): void {
  const g = p.group.id;
  const dateOf = new Map<LessonId, IsoDate>();
  const slotDate = new Map(p.usable.map((s) => [s.key, s.date]));
  for (const x of p.out.placements) {
    const date = x.slotKey ? slotDate.get(x.slotKey) : undefined;
    if (date) dateOf.set(x.lessonId, date);
  }
  const notAfter = inputs.pins
    .filter((x) => x.groupId === g && x.kind === "not-after")
    .sort(byId);
  for (const pin of notAfter) {
    if (pin.kind !== "not-after") continue;
    if (!p.known.has(pin.lessonId)) {
      p.out.conflicts.push({
        kind: "pin-lesson-unknown",
        pinId: pin.id,
        groupId: g,
        lessonId: pin.lessonId,
        slotKey: null,
      });
      continue;
    }
    // A deadline on a lesson already taught is moot.
    if (!p.undeclared.has(pin.lessonId)) continue;
    const plannedDate = dateOf.get(pin.lessonId) ?? null;
    if (plannedDate === null || plannedDate > pin.date)
      p.out.conflicts.push({
        kind: "not-after-missed",
        pinId: pin.id,
        groupId: g,
        lessonId: pin.lessonId,
        date: pin.date,
        plannedDate,
      });
  }
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
 * Plans every group of the course. Each group's history, slot pins and dated
 * assessments are fixed first, in its own slots. Then the groups of one track
 * are planned together on the pace line (`planWindows`), checkpoint by
 * checkpoint: assessments, block ends, the revision block and the official
 * exams. Slots in a group's revision block, and in windows after the final
 * content checkpoint, are spare lessons; slots from a group's last official
 * exam on, and after the last checkpoint, hold nothing. The output does not
 * depend on the order of the input arrays.
 */
export function sequence(inputs: PlanInputs): PlanSnapshot {
  const groups = [...inputs.groups]
    .filter((g) => g.courseId === inputs.courseId)
    .sort(byId);
  const ours = new Set(groups.map((g) => g.id));
  const exams = inputs.exams.filter((e) => e.groupIds.some((g) => ours.has(g)));
  const cutoffs = examCutoffs(exams);
  const firstExam = exams.map((e) => e.date).sort()[0] ?? null;
  const latestExam =
    exams
      .map((e) => e.date)
      .sort()
      .at(-1) ?? null;

  const horizonEnd = freezeHorizonEnd(
    inputs.today,
    inputs.slots.filter((s) => ours.has(s.groupId)),
  );
  const results = groups.map((g) =>
    prepareGroup(g, inputs, cutoffs.get(g.id) ?? null, horizonEnd),
  );
  const prepared = results.filter((r): r is Prepared => "group" in r);
  for (const p of prepared) {
    p.revision = revisionBlock(p.usable, inputs.revisionWeeks, firstExam);
  }

  const checkpoints = checkpointsOf(inputs.items, inputs.blocks, inputs.today)
    .concat(examCheckpoints(exams, inputs.today))
    .filter(
      (c) => c.kind === "exam" || latestExam === null || c.date <= latestExam,
    );
  const perGroupDate: Record<GroupId, IsoDate> = {};
  for (const p of prepared) {
    const first = p.revision[0];
    if (first) perGroupDate[p.group.id] = first.date;
  }
  const revisionDates = Object.values(perGroupDate).sort();
  if (revisionDates[0] !== undefined)
    checkpoints.push({
      id: REVISION_ID,
      kind: "revision",
      date: revisionDates[0],
      label: "Before revision",
      itemId: null,
      perGroupDate,
    });
  checkpoints.sort(byCheckpointOrder);

  for (const track of ["core", "hl"] as const) {
    const set = prepared.filter((p) => p.group.track === track);
    if (set.length > 0) planPaceSet(set, track, inputs, checkpoints);
  }

  const plans = results.map((r) => ("group" in r ? r.out : r));
  const cpIndex = new Map(checkpoints.map((c, i) => [c.id, i]));
  const atCheckpoint = (o: Overflow) =>
    o.checkpointId === null
      ? checkpoints.length
      : (cpIndex.get(o.checkpointId) ?? checkpoints.length);
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
          cmp(a.groupId, b.groupId) || atCheckpoint(a) - atCheckpoint(b),
      ),
    absorbed: plans
      .flatMap((p) => p.absorbed)
      .sort((a, b) => cmp(a.groupId, b.groupId) || cmp(a.lessonId, b.lessonId)),
    conflicts: plans
      .flatMap((p) => p.conflicts)
      .sort((a, b) => byKeys(conflictKey(a), conflictKey(b))),
  };
}
