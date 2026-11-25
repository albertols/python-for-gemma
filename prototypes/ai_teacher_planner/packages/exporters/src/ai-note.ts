import { exportable, type Provenance } from "@planner/domain";
import type { HeldBack } from "./model.ts";

/** An item in an export. `reviewedOn` is the day she reviewed it, when the caller knows it. */
interface Included {
  provenance: Provenance;
  reviewedOn?: string | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What an export says about AI. `statement` names the AI items that went in, with
 * the day she reviewed them (the day the AI ran, when the caller gives no review day).
 * `warning` counts the AI items that were left out: those she has not reviewed, and
 * those she rejected. Engine, teacher and import items are never counted.
 */
export function aiNote(
  included: readonly Included[],
  excluded: readonly { provenance: Provenance }[],
): { statement: string | null; warning: string | null } {
  const days = included
    .filter((i) => i.provenance.origin === "ai" && i.provenance.ai !== null)
    .map((i) => i.reviewedOn ?? i.provenance.ai?.at.slice(0, 10) ?? "")
    .sort();
  let statement: string | null = null;
  if (days.length > 0) {
    const first = days[0];
    const last = days[days.length - 1];
    const when =
      first === last ? `on ${first}` : `between ${first} and ${last}`;
    statement = `${days.length} ${plural(days.length, "item was", "items were")} drafted by AI and reviewed ${when}.`;
  }

  const ai = excluded.filter((i) => i.provenance.origin === "ai");
  const rejected = ai.filter((i) => i.provenance.ai?.review === "rejected");
  const waiting = ai.length - rejected.length;
  const sentences: string[] = [];
  if (waiting > 0)
    sentences.push(
      `${waiting} AI ${plural(waiting, "suggestion was", "suggestions were")} left out because you have not reviewed ${plural(waiting, "it", "them")}.`,
    );
  if (rejected.length > 0)
    sentences.push(
      `${rejected.length} rejected AI ${plural(rejected.length, "suggestion was", "suggestions were")} left out.`,
    );
  return {
    statement,
    warning: sentences.length > 0 ? sentences.join(" ") : null,
  };
}

/**
 * The one rule for what leaves the app: lessons she has not accepted are held
 * back (with anything the caller adds), and the note says so.
 */
export function reviewedOnly<T extends { provenance: Provenance }>(
  lessons: readonly T[],
  heldBack: readonly HeldBack[] = [],
): { included: T[]; statement: string | null; warning: string | null } {
  const { included, excluded } = exportable(lessons);
  return { included, ...aiNote(included, [...excluded, ...heldBack]) };
}
