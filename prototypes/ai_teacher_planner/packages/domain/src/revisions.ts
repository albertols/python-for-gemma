import type { IsoDate } from "./dates.ts";
import { isHistory, slotDate } from "./history.ts";
import type { LessonId } from "./lessons.ts";
import type {
  Conflict,
  Placement,
  PlacementState,
  PlanInputs,
  PlanSnapshot,
} from "./plan.ts";
import { sequence } from "./sequence.ts";
import type { Slot, SlotKey } from "./slots.ts";
import type { GroupId } from "./timetable.ts";

const isFlex = (lessonId: LessonId) => lessonId.startsWith("flex:");
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface PlanDiffEntry {
  groupId: GroupId;
  lessonId: LessonId;
  change: "moved" | "added" | "removed" | "state" | "correction";
  from: SlotKey | null;
  to: SlotKey | null;
  fromState: PlacementState | null;
  toState: PlacementState | null;
  hitByDisruption: boolean;
}
export interface PlanDiff {
  entries: PlanDiffEntry[];
  changedByGroup: Record<GroupId, number>;
}
export interface PlanMetrics {
  perGroup: Record<
    GroupId,
    {
      placed: number;
      spare: number;
      overflow: number;
      lastContentDate: IsoDate | null;
      officialExam: { code: string; date: IsoDate } | null;
    }
  >;
}
export interface Proposal {
  planId: string;
  baseRevisionId: string | null;
  label: string;
  candidate: PlanSnapshot;
  diff: PlanDiff;
  before: PlanMetrics | null;
  after: PlanMetrics;
  conflicts: Conflict[];
}
export interface PlanRevision {
  id: string;
  planId: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  snapshot: PlanSnapshot;
}
export interface PlanChain {
  planId: string;
  headId: string | null;
  revisions: Record<string, PlanRevision>;
}

/**
 * What changed between two plans, lesson by lesson (a lesson is a group and a
 * lesson id). Never listed: spare lessons (they are counted in the metrics),
 * history, lessons she pinned in both plans, and assessments. The one change
 * to history that is listed is a correction: a lesson that was planned,
 * assumed or taught and is now logged as skipped, with the slot it left and
 * the slot it now holds (null when it fits nowhere).
 *
 * `hitByDisruption`: the lesson's old slot is cancelled in `slots`, or is a
 * cover slot the lesson was not already placed on by choice. Those entries
 * come first, then the rest by date, group and lesson.
 */
export function diffSnapshots(
  before: PlanSnapshot | null,
  after: PlanSnapshot,
  slots: readonly Slot[],
): PlanDiff {
  const slotOf = new Map(slots.map((s) => [s.key, s]));
  const byLesson = new Map<string, { b: Placement[]; a: Placement[] }>();
  const bucket = (p: Placement) => {
    const key = `${p.groupId}\u0000${p.lessonId}`;
    const entry = byLesson.get(key) ?? { b: [], a: [] };
    byLesson.set(key, entry);
    return entry;
  };
  for (const p of before?.placements ?? []) bucket(p).b.push(p);
  for (const p of after.placements) bucket(p).a.push(p);

  const hit = (p: Placement | undefined): boolean => {
    if (p?.slotKey == null) return false;
    const slot = slotOf.get(p.slotKey);
    return (
      slot === undefined ||
      slot.status === "cancelled" ||
      (slot.status === "cover" && !p.viaCover)
    );
  };
  const live = (list: Placement[]) => list.find((p) => !isHistory(p));
  const entries: PlanDiffEntry[] = [];
  for (const { b, a } of byLesson.values()) {
    const [any] = a.length > 0 ? a : b;
    if (!any || isFlex(any.lessonId)) continue;
    const { groupId, lessonId } = any;
    const bLive = live(b);
    const aLive = live(a);
    const skipped = a.find((p) => p.state === "skipped" && p.slotKey !== null);
    const was = skipped
      ? b.find((p) => p.slotKey === skipped.slotKey && p.state !== "skipped")
      : undefined;
    if (skipped && was) {
      entries.push({
        groupId,
        lessonId,
        change: "correction",
        from: skipped.slotKey,
        to: aLive?.slotKey ?? null,
        fromState: was.state,
        toState: "skipped",
        hitByDisruption: false,
      });
      continue;
    }
    if (aLive?.pinned && bLive?.pinned) continue;
    if (!aLive) {
      if (a.some(isHistory) || !bLive) continue;
      entries.push({
        groupId,
        lessonId,
        change: "removed",
        from: bLive.slotKey,
        to: null,
        fromState: bLive.state,
        toState: null,
        hitByDisruption: hit(bLive),
      });
      continue;
    }
    const prior = bLive ?? b.find((p) => p.slotKey === aLive.slotKey);
    if (!prior) {
      entries.push({
        groupId,
        lessonId,
        change: "added",
        from: null,
        to: aLive.slotKey,
        fromState: null,
        toState: aLive.state,
        hitByDisruption: false,
      });
    } else if (prior.slotKey !== aLive.slotKey || prior.state !== aLive.state) {
      entries.push({
        groupId,
        lessonId,
        change: prior.slotKey !== aLive.slotKey ? "moved" : "state",
        from: prior.slotKey,
        to: aLive.slotKey,
        fromState: prior.state,
        toState: aLive.state,
        hitByDisruption: hit(prior),
      });
    }
  }

  const when = (e: PlanDiffEntry) => slotDate(e.to ?? e.from ?? "");
  entries.sort(
    (x, y) =>
      Number(y.hitByDisruption) - Number(x.hitByDisruption) ||
      cmp(when(x), when(y)) ||
      cmp(x.groupId, y.groupId) ||
      cmp(x.lessonId, y.lessonId),
  );
  const changedByGroup: Record<GroupId, number> = {};
  for (const id of groupIds(before)) changedByGroup[id] = 0;
  for (const id of groupIds(after)) changedByGroup[id] = 0;
  for (const e of entries)
    changedByGroup[e.groupId] = (changedByGroup[e.groupId] ?? 0) + 1;
  return { entries, changedByGroup };
}

/** Every group a plan says anything about, including one that got no placement. */
function groupIds(s: PlanSnapshot | null): Set<GroupId> {
  const ids = new Set<GroupId>();
  if (s === null) return ids;
  for (const p of s.placements) ids.add(p.groupId);
  for (const a of s.assessments) ids.add(a.groupId);
  for (const o of s.overflow) ids.add(o.groupId);
  for (const c of s.conflicts) if ("groupId" in c) ids.add(c.groupId);
  return ids;
}

/**
 * Numbers per group for the proposal summary.
 * - `placed`: lessons of the scheme that have a placement (a declared lesson
 *   counts; a skipped one does not, the lesson is waiting to be placed again).
 * - `spare`: spare lessons in the whole plan.
 * - `overflow`: lessons never placed, meaning not placed by the final content
 *   checkpoint. An overflow entry lists lessons that are late for one
 *   checkpoint, so a lesson can be listed at several and is counted once, and
 *   only when it has no placement at all. Placed plus overflow is the total.
 * - `lastContentDate`: the date of the last lesson of the scheme.
 * - `officialExam`: the plan's first official exam checkpoint, if any. A
 *   checkpoint does not say which groups sit it, so every group gets it.
 * `slots` is kept for the contract of the plan index; the numbers do not need it.
 */
export function planMetrics(
  s: PlanSnapshot,
  _slots: readonly Slot[],
): PlanMetrics {
  const exam = s.checkpoints
    .filter((c) => c.kind === "exam")
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id))[0];
  const officialExam = exam
    ? { code: exam.id.replace(/^cp:exam:/, ""), date: exam.date }
    : null;
  const perGroup: PlanMetrics["perGroup"] = {};
  for (const g of groupIds(s)) {
    const mine = s.placements.filter(
      (p) => p.groupId === g && p.state !== "skipped",
    );
    const lessons = mine.filter((p) => !isFlex(p.lessonId));
    const placed = new Set(lessons.map((p) => p.lessonId));
    const late = new Set(
      s.overflow
        .filter((o) => o.groupId === g)
        .flatMap((o) => o.lessonIds)
        .filter((id) => !isFlex(id) && !placed.has(id)),
    );
    const dates = lessons.flatMap((p) =>
      p.slotKey === null ? [] : [slotDate(p.slotKey)],
    );
    perGroup[g] = {
      placed: placed.size,
      spare: mine.filter((p) => isFlex(p.lessonId) && p.slotKey !== null)
        .length,
      overflow: late.size,
      lastContentDate: dates.sort().at(-1) ?? null,
      officialExam,
    };
  }
  return { perGroup };
}

/**
 * A candidate plan from `inputs`, planned on top of `head` (the head replaces
 * `inputs.previous`), with its diff, the metrics before and after, and the
 * conflicts. Nothing is stored: she accepts or cancels.
 */
export function propose(args: {
  planId: string;
  baseRevisionId: string | null;
  head: PlanSnapshot | null;
  inputs: PlanInputs;
  label: string;
}): Proposal {
  const candidate = sequence({ ...args.inputs, previous: args.head });
  return {
    planId: args.planId,
    baseRevisionId: args.baseRevisionId,
    label: args.label,
    candidate,
    diff: diffSnapshots(args.head, candidate, args.inputs.slots),
    before: args.head ? planMetrics(args.head, args.inputs.slots) : null,
    after: planMetrics(candidate, args.inputs.slots),
    conflicts: candidate.conflicts,
  };
}

/** The plan she is on now; null before the first accepted plan. */
export function headSnapshot(chain: PlanChain): PlanSnapshot | null {
  return chain.headId === null
    ? null
    : (chain.revisions[chain.headId]?.snapshot ?? null);
}

/**
 * Makes the proposal's candidate the new head, as an immutable revision whose
 * parent is the old head. Refused as `stale` unless the proposal was made on
 * the current head (and for this plan). The chain given is never changed.
 */
export function acceptProposal(
  chain: PlanChain,
  proposal: Proposal,
  meta: { id: string; createdAt: string },
): { ok: true; chain: PlanChain } | { ok: false; reason: "stale" } {
  if (
    proposal.planId !== chain.planId ||
    proposal.baseRevisionId !== chain.headId
  )
    return { ok: false, reason: "stale" };
  if (meta.id in chain.revisions)
    throw new Error(`revision ${meta.id} already exists`);
  const revision: PlanRevision = {
    id: meta.id,
    planId: chain.planId,
    parentId: chain.headId,
    label: proposal.label,
    createdAt: meta.createdAt,
    // A copy, so the proposal can never change a saved revision. A snapshot is plain JSON.
    snapshot: JSON.parse(JSON.stringify(proposal.candidate)) as PlanSnapshot,
  };
  return {
    ok: true,
    chain: {
      planId: chain.planId,
      headId: revision.id,
      revisions: { ...chain.revisions, [revision.id]: revision },
    },
  };
}

/**
 * Back to the parent revision. The undone revision stays in the chain, and the
 * facts behind it (log, disruptions) are not touched.
 */
export function undo(
  chain: PlanChain,
): { ok: true; chain: PlanChain } | { ok: false; reason: "nothing-to-undo" } {
  const head =
    chain.headId === null ? undefined : chain.revisions[chain.headId];
  if (!head || head.parentId === null)
    return { ok: false, reason: "nothing-to-undo" };
  return { ok: true, chain: { ...chain, headId: head.parentId } };
}

/** JSON text with object keys sorted: the same text for deep-equal snapshots, a different one otherwise. */
export function snapshotKey(s: PlanSnapshot): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v !== null && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .sort(([x], [y]) => cmp(x, y))
              .map(([k, x]) => [k, canon(x)]),
          )
        : v;
  return JSON.stringify(canon(s));
}

/** True when the two plans differ in nothing but the state of history placements (assumed to taught, and so on). */
export function sameExceptHistoryStates(
  a: PlanSnapshot,
  b: PlanSnapshot,
): boolean {
  const normal = (s: PlanSnapshot): PlanSnapshot => ({
    ...s,
    placements: s.placements.map((p) =>
      isHistory(p) ? { ...p, state: "taught" } : p,
    ),
  });
  return snapshotKey(normal(a)) === snapshotKey(normal(b));
}
