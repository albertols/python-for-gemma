import {
  type Group,
  possibleDisruptions,
  possibleTextsFor,
  type Slot,
} from "@planner/domain";
import type { EventItem } from "../api/queries.ts";

/** For each lesson, the unconfirmed calendar events that might cancel it. Empty until the events have loaded. */
export function possibleOf(
  events: readonly EventItem[] | undefined,
  groups: readonly Group[] | undefined,
): (slot: Slot) => string[] {
  if (!events || !groups) return () => [];
  const yearOf = new Map(groups.map((g) => [g.id, g.yearGroup]));
  const possible = possibleDisruptions(
    events,
    events.flatMap((e) => e.classifications),
  );
  return (slot) => possibleTextsFor(slot, yearOf, possible);
}
