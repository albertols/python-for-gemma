import {
  type Conflict,
  type GroupId,
  type GroupOverride,
  type LessonId,
  lessonsFor,
  type PlanDiff,
  type PlanDiffEntry,
  type PlanMetrics,
  type Proposal,
  type SlotKey,
  type SowItem,
} from "@planner/domain";
import { useId } from "react";
import { fullDay, longDate } from "../lib/dates.ts";
import { STATE_LABEL } from "../screens/board/board-plan.ts";

/** How the dialog names lessons and items: "Markets 3 of 4", "20 mark". */
export interface LessonNames {
  lesson(groupId: GroupId, lessonId: LessonId): string;
  item(itemId: string): string;
}

/** Names from the course's scheme; an id the scheme no longer has is shown as it is. */
export function namesFrom(
  items: readonly SowItem[],
  overrides: readonly GroupOverride[],
): LessonNames {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    lesson(groupId, lessonId) {
      if (lessonId.startsWith("flex:")) return "Spare lesson";
      const [itemId = "", n = ""] = lessonId.split("#");
      const item = byId.get(itemId);
      return item
        ? `${item.title} ${n} of ${lessonsFor(item, overrides, groupId)}`
        : lessonId;
    },
    item: (itemId) => byId.get(itemId)?.title ?? itemId,
  };
}

/** "Monday 23 November, period 5". */
function whenOf(slotKey: SlotKey | null): string {
  if (slotKey === null) return "does not fit";
  const [, date = "", period = ""] = slotKey.split("|");
  return `${fullDay(date)}, period ${period}`;
}

const FROZEN_LESSON =
  "This lesson is in the next two teaching days, so it stays where it is.";
const FROZEN_ASSESSMENT =
  "This assessment is in the next two teaching days, so it stays where it is.";

/** One plain sentence for a conflict, naming the group and the lesson or assessment. */
export function conflictSentence(c: Conflict, names: LessonNames): string {
  switch (c.kind) {
    case "assessment-no-slot":
      return `${c.groupId}: there is no lesson left for "${names.item(c.itemId)}" on ${longDate(c.date)}.`;
    case "position-unknown":
      return `${c.groupId}: the position names "${c.lessonId}", which is not in the scheme, so nothing is planned for this group.`;
    case "pin-lesson-unknown":
      return `${c.groupId}: a pin names "${c.lessonId}", which is not in the scheme, so the pin is not used.`;
    case "pin-frozen":
      return `${c.groupId}, ${names.lesson(c.groupId, c.lessonId)}: ${FROZEN_LESSON}`;
    case "anchor-frozen":
      return `${c.groupId}, ${names.item(c.itemId)}: ${FROZEN_ASSESSMENT}`;
    case "pin-slot-unavailable":
      return `${c.groupId}: ${names.lesson(c.groupId, c.lessonId)} is pinned to ${whenOf(c.slotKey)}, which has no lesson now.`;
    case "not-after-missed":
      return `${c.groupId}: ${names.lesson(c.groupId, c.lessonId)} should be taught by ${longDate(c.date)} but ${c.plannedDate ? `is planned for ${longDate(c.plannedDate)}` : "does not fit in the plan"}.`;
    case "hl-prerequisite":
      return `${c.groupId}: ${names.lesson(c.groupId, c.lessonId)} needs "${names.item(c.prerequisiteItemId)}" first, which ${c.finishesOn ? `finishes on ${longDate(c.finishesOn)}` : "is not planned yet"}.`;
  }
}

export interface SummaryRow {
  label: string;
  values: Record<GroupId, string>;
}

/**
 * The before-and-after summary, one row per measure and one value per group:
 * "12 → 13" when it changes, "13" when it does not (or on a first plan). With
 * an official exam, the lessons that do not fit are the ones left after it.
 */
export function summaryRows(
  before: PlanMetrics | null,
  after: PlanMetrics,
): SummaryRow[] {
  const groups = Object.keys(after.perGroup).sort();
  type M = PlanMetrics["perGroup"][string];
  const row = (label: string, show: (m: M) => string): SummaryRow => {
    const values: Record<GroupId, string> = {};
    for (const g of groups) {
      const now = after.perGroup[g] as M;
      const was = before?.perGroup[g];
      const a = show(now);
      const b = was ? show(was) : a;
      values[g] = a === b ? a : `${b} → ${a}`;
    }
    return { label, values };
  };
  const withExam =
    groups.length > 0 &&
    groups.every((g) => after.perGroup[g]?.officialExam != null);
  return [
    row("Lessons placed", (m) => String(m.placed)),
    row("Spare lessons", (m) => String(m.spare)),
    row(
      withExam ? "Lessons after the official exam" : "Lessons that do not fit",
      (m) => String(m.overflow),
    ),
    row("Last content lesson", (m) =>
      m.lastContentDate ? longDate(m.lastContentDate) : "None",
    ),
    row("Official exam", (m) =>
      m.officialExam
        ? `${m.officialExam.code} on ${longDate(m.officialExam.date)}`
        : "None",
    ),
  ];
}

/** The changes by group, in group order; inside a group, lessons hit by a disruption first. */
export function changesByGroup(
  diff: PlanDiff,
): { groupId: GroupId; entries: PlanDiffEntry[] }[] {
  const groups = [...new Set(diff.entries.map((e) => e.groupId))].sort();
  return groups.map((groupId) => {
    const mine = diff.entries.filter((e) => e.groupId === groupId);
    return {
      groupId,
      entries: [
        ...mine.filter((e) => e.hitByDisruption),
        ...mine.filter((e) => !e.hitByDisruption),
      ],
    };
  });
}

/** One change with its old and new date: "Markets 3 of 4: Monday 23 November, period 5 → Wednesday 25 November, period 2". */
export function changeSentence(e: PlanDiffEntry, names: LessonNames): string {
  const hit = e.hitByDisruption ? "its lesson was cancelled. " : "";
  const what = `${names.lesson(e.groupId, e.lessonId)}: ${hit}`;
  switch (e.change) {
    case "added":
      return `${what}new, ${whenOf(e.to)}`;
    case "state":
      return `${what}${whenOf(e.to ?? e.from)}, ${e.fromState ? STATE_LABEL[e.fromState] : "none"} → ${e.toState ? STATE_LABEL[e.toState] : "none"}`;
    case "correction":
      return `${what}did not happen on ${whenOf(e.from)}, now ${whenOf(e.to)}`;
    default:
      return `${what}${whenOf(e.from)} → ${whenOf(e.to)}`;
  }
}

/** Shown in full; longer lists keep the rest folded away. */
const SHOWN = 10;

/** What a proposal would do: the summary per group, the conflicts, and every change. */
export function ProposalDiff({
  proposal,
  names,
}: {
  proposal: Proposal;
  names: LessonNames;
}) {
  const ids = useId();
  const rows = summaryRows(proposal.before, proposal.after);
  const groups = Object.keys(proposal.after.perGroup).sort();
  const changes = new Map(
    changesByGroup(proposal.diff).map((g) => [g.groupId, g.entries]),
  );
  const sentence = (e: PlanDiffEntry) => changeSentence(e, names);
  return (
    <div className="space-y-5">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="mb-1 text-left font-semibold">
          Before and after, by group
        </caption>
        <thead>
          <tr className="border-b border-border">
            <td />
            {groups.map((g) => (
              <th key={g} scope="col" className="py-1 pr-3">
                {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border">
              <th scope="row" className="py-1 pr-3 font-normal">
                {r.label}
              </th>
              {groups.map((g) => (
                <td key={g} className="py-1 pr-3">
                  {r.values[g]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-labelledby={`${ids}-conflicts`}>
        <h3 id={`${ids}-conflicts`} className="font-semibold">
          Conflicts
        </h3>
        {proposal.conflicts.length === 0 ? (
          <p>No conflicts.</p>
        ) : (
          <ul className="list-disc pl-5">
            {proposal.conflicts.map((c) => {
              const text = conflictSentence(c, names);
              return <li key={text}>{text}</li>;
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${ids}-changes`}>
        <h3 id={`${ids}-changes`} className="font-semibold">
          Changes
        </h3>
        {groups.map((g) => {
          const mine = changes.get(g) ?? [];
          return (
            <section key={g} aria-label={`Changes for ${g}`} className="mt-2">
              <h4 className="font-medium">{g}</h4>
              {mine.length === 0 ? (
                <p className="text-muted-foreground">Nothing moves for {g}.</p>
              ) : (
                <>
                  <ul className="list-disc pl-5">
                    {mine.slice(0, SHOWN).map((e) => (
                      <li key={`${e.lessonId}-${e.change}`}>{sentence(e)}</li>
                    ))}
                  </ul>
                  {mine.length > SHOWN ? (
                    <details className="pl-5">
                      <summary>And {mine.length - SHOWN} more</summary>
                      <ul className="list-disc pl-5">
                        {mine.slice(SHOWN).map((e) => (
                          <li key={`${e.lessonId}-${e.change}`}>
                            {sentence(e)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}
