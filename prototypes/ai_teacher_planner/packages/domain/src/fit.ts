import { finalContentIndex } from "./pace.ts";
import type { PlanInputs } from "./plan.ts";
import { planMetrics } from "./revisions.ts";
import { sequence } from "./sequence.ts";
import type { GroupId } from "./timetable.ts";

/**
 * Whether one group's scheme fits what it has left, from today.
 * - `lessonsLeft`: lessons of the scheme still to teach (not history, not
 *   declared): those planned, plus those never placed. A merged pair is one.
 * - `slotsLeft`: slots that can take a lesson of the scheme: the planned ones,
 *   and spare lessons up to the final content checkpoint, so never a revision
 *   lesson or a spare lesson after the official exam.
 * - `over`: lessons never placed (`PlanMetrics.overflow`); `fits` is `over === 0`.
 */
export interface GroupFit {
  groupId: GroupId;
  lessonsLeft: number;
  slotsLeft: number;
  fits: boolean;
  over: number;
}

/**
 * "Does it fit", for each of the course's groups, by group id. It runs
 * `sequence`, so it is the same rule as the plan itself; the API and the
 * scheme screen both call it.
 */
export function fitFor(inputs: PlanInputs): GroupFit[] {
  const snapshot = sequence(inputs);
  const metrics = planMetrics(snapshot, inputs.slots);
  const final = finalContentIndex(snapshot.checkpoints);
  const lateCheckpoints = new Set(
    snapshot.checkpoints.slice(final + 1).map((c) => c.id),
  );
  const revision = snapshot.checkpoints.find((c) => c.kind === "revision");
  const groups = inputs.groups
    .filter((g) => g.courseId === inputs.courseId)
    .map((g) => g.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return groups.map((groupId) => {
    const mine = snapshot.placements.filter(
      (p) =>
        p.groupId === groupId &&
        p.state === "planned" &&
        p.slotKey !== null &&
        p.mergedInto === null,
    );
    const prefix = `flex:${groupId}:`;
    const content = mine.filter((p) => !p.lessonId.startsWith("flex:"));
    const spare = mine.filter((p) => {
      if (!p.lessonId.startsWith(prefix)) return false;
      const checkpointId = p.lessonId.slice(
        prefix.length,
        p.lessonId.lastIndexOf("#"),
      );
      if (lateCheckpoints.has(checkpointId)) return false;
      if (checkpointId !== revision?.id) return true;
      // under the revision checkpoint: the ones before her revision block only
      const starts = revision.perGroupDate?.[groupId];
      const date = (p.slotKey ?? "").split("|")[1] ?? "";
      return starts === undefined || date < starts;
    });
    const over = metrics.perGroup[groupId]?.overflow ?? 0;
    return {
      groupId,
      lessonsLeft: content.length + over,
      slotsLeft: content.length + spare.length,
      fits: over === 0,
      over,
    };
  });
}
