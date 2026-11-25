import type { Lesson, LessonId } from "./lessons.ts";
import type { Checkpoint } from "./plan.ts";
import type { SlotKey } from "./slots.ts";
import type { Group, GroupId } from "./timetable.ts";

/**
 * An undated assessment that takes a whole slot. It sits in a group's stream
 * where the scheme puts it and uses a slot like a lesson. Its id is the item id.
 */
export interface StreamAssessment {
  kind: "assessment";
  id: string;
  itemId: string;
}

/**
 * One slot's worth of a group's stream, in scheme order: a lesson (a merged pair
 * travels as its first lesson) or an undated whole-slot assessment.
 */
export type StreamEntry = Lesson | StreamAssessment;

/**
 * What one window, the slots before one checkpoint, holds for each group. Ids
 * are lesson ids, or the item id of an undated whole-slot assessment.
 * `required` and `broughtForward` fill the window's earliest slots, in that
 * order; the last `spare` slots are spare lessons. `short` is what was due and
 * did not fit: it is overflow at this checkpoint and first in line in the next
 * window. `absorbed` holds the buffer lessons dropped to make room.
 */
export interface WindowPlan {
  checkpoint: Checkpoint;
  perGroup: Record<
    GroupId,
    {
      slots: SlotKey[];
      required: LessonId[];
      broughtForward: LessonId[];
      spare: number;
      short: LessonId[];
      absorbed: LessonId[];
    }
  >;
}

/**
 * The checkpoint by which all content must be taught: the revision block when
 * there is one, else the first official exam, else the last checkpoint. After
 * it, windows hold spare lessons only. -1 when there are no checkpoints.
 */
export function finalContentIndex(checkpoints: readonly Checkpoint[]): number {
  const revision = checkpoints.findIndex((c) => c.kind === "revision");
  if (revision >= 0) return revision;
  const exam = checkpoints.findIndex((c) => c.kind === "exam");
  if (exam >= 0) return exam;
  return checkpoints.length - 1;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isBuffer = (e: StreamEntry) => e.kind === "buffer";

/**
 * How many of `rest` (a group's stream after what is due) belong to the run that
 * ends at `canonical[j]`: the longest prefix whose last lesson comes no later in
 * the course's own order. A run that ends an item takes every lesson the group
 * has of it (an override may lengthen it), and the run to the end of the course
 * takes everything left. Entries the course list does not have (an undated
 * assessment, an item only this group teaches) travel with the lesson after them.
 */
function shareOf(
  rest: readonly StreamEntry[],
  canonical: readonly Lesson[],
  rank: ReadonlyMap<string, number>,
  j: number,
): number {
  if (j >= canonical.length - 1) return rest.length;
  const end = canonical[j];
  if (!end) return 0;
  const endRank = rank.get(end.itemId) ?? -1;
  const endsItem = end.index === end.of;
  let share = 0;
  for (let i = 0; i < rest.length; i++) {
    const e = rest[i];
    if (!e || e.kind === "assessment") continue;
    const r = rank.get(e.itemId);
    if (r === undefined) continue;
    const inRun =
      r < endRank || (r === endRank && (endsItem || e.index <= end.index));
    if (!inRun) break;
    share = i + 1;
  }
  return share;
}

/**
 * The pace line (spec section 10.6). Groups of one track are planned together,
 * checkpoint by checkpoint, in the order given. In each window a group places
 * what is due, then the longest run of the next lessons in the course's own
 * order that every group can fit, and its free slots are spare lessons. A group
 * that cannot fit what is due drops buffer lessons, then is short alone, and
 * nobody brings anything forward. At the final content checkpoint
 * (`finalContentIndex`) everything left is due, and what does not fit is final:
 * later windows are all spare.
 */
export function planWindows(args: {
  groups: readonly Group[];
  checkpoints: readonly Checkpoint[];
  streams: Record<GroupId, readonly StreamEntry[]>;
  windowSlots: (groupId: GroupId, checkpoint: Checkpoint) => SlotKey[];
  /** Item ids due before the checkpoint. Not asked for the final content checkpoint, where everything is due. */
  requiredBefore: (checkpoint: Checkpoint) => Set<string>;
  /** The track's lessons with no overrides: "the next lesson" means the same for every group. */
  canonical: Lesson[];
}): WindowPlan[] {
  const ids = args.groups.map((g) => g.id).sort(cmp);
  const rank = new Map<string, number>();
  for (const l of args.canonical)
    if (!rank.has(l.itemId)) rank.set(l.itemId, rank.size);
  const remaining = new Map<GroupId, StreamEntry[]>(
    ids.map((g) => [g, [...(args.streams[g] ?? [])]]),
  );
  /** Entries at the head of a stream that were short at an earlier checkpoint. */
  const carried = new Map<GroupId, number>(ids.map((g) => [g, 0]));
  const final = finalContentIndex(args.checkpoints);

  return args.checkpoints.map((checkpoint, k): WindowPlan => {
    const perGroup: WindowPlan["perGroup"] = {};
    if (k > final) {
      for (const g of ids) {
        const slots = args.windowSlots(g, checkpoint);
        perGroup[g] = {
          slots,
          required: [],
          broughtForward: [],
          spare: slots.length,
          short: [],
          absorbed: [],
        };
      }
      return { checkpoint, perGroup };
    }
    const due = k === final ? null : args.requiredBefore(checkpoint);
    const state = ids.map((g) => {
      const slots = args.windowSlots(g, checkpoint);
      const rest = remaining.get(g) ?? [];
      let dueLength = carried.get(g) ?? 0;
      if (due === null) dueLength = rest.length;
      else
        for (let i = rest.length - 1; i >= dueLength; i--)
          if (due.has(rest[i]?.itemId ?? "")) {
            dueLength = i + 1;
            break;
          }
      // Buffer lessons are counted last: dropped, last first, only to make room.
      const absorbed: LessonId[] = [];
      for (let i = dueLength - 1; i >= 0 && dueLength > slots.length; i--) {
        const e = rest[i];
        if (!e || !isBuffer(e)) continue;
        absorbed.unshift(e.id);
        rest.splice(i, 1);
        dueLength--;
      }
      return { g, slots, rest, dueLength, absorbed };
    });

    // Bring forward the longest run that every group can fit in its slack.
    const shares = new Map<GroupId, number>(ids.map((g) => [g, 0]));
    if (state.every((s) => s.dueLength <= s.slots.length)) {
      const cuts = Math.max(args.canonical.length, 1);
      for (let j = 0; j < cuts; j++) {
        const at = state.map((s) =>
          shareOf(s.rest.slice(s.dueLength), args.canonical, rank, j),
        );
        if (
          at.some(
            (n, i) =>
              n > (state[i]?.slots.length ?? 0) - (state[i]?.dueLength ?? 0),
          )
        )
          break;
        for (const [i, s] of state.entries()) shares.set(s.g, at[i] ?? 0);
      }
    }

    for (const s of state) {
      const fits = Math.min(s.dueLength, s.slots.length);
      const share = shares.get(s.g) ?? 0;
      const required = s.rest.slice(0, fits);
      const short = s.rest.slice(fits, s.dueLength);
      const broughtForward = s.rest.slice(s.dueLength, s.dueLength + share);
      perGroup[s.g] = {
        slots: s.slots,
        required: required.map((e) => e.id),
        broughtForward: broughtForward.map((e) => e.id),
        spare: s.slots.length - required.length - broughtForward.length,
        short: short.map((e) => e.id),
        absorbed: s.absorbed,
      };
      remaining.set(s.g, s.rest.slice(fits + broughtForward.length));
      carried.set(s.g, short.length);
    }
    return { checkpoint, perGroup };
  });
}
