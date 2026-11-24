import {
  type EventClassification,
  possibleDisruptions,
  possibleTextsFor,
  type Slot,
  type YearGroup,
} from "@planner/domain";
import type { EventItem } from "../api/queries.ts";

/** For each lesson, the unconfirmed calendar events that might cancel it. Empty until the events have loaded. */
export function possibleOf(
  events: readonly EventItem[] | undefined,
  groups: readonly { id: string; yearGroup: number }[] | undefined,
): (slot: Slot) => string[] {
  if (!events || !groups) return () => [];
  const yearOf = new Map(groups.map((g) => [g.id, g.yearGroup as YearGroup]));
  const confirmations = events.flatMap(
    (e) => e.classifications,
  ) as EventClassification[];
  const possible = possibleDisruptions(
    events as unknown as Parameters<typeof possibleDisruptions>[0],
    confirmations,
  );
  return (slot) => possibleTextsFor(slot, yearOf, possible);
}
