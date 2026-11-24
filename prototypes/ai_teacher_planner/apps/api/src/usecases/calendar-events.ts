import {
  classificationConflicts,
  disruptionsFromEvents,
  type EventCandidate,
  type EventClassification,
  type IsoDate,
  keptDates,
  lessonsHitBy,
  type Period,
  type StaleClassification,
  staleClassifications,
  type YearGroup,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";
import { loadPlanning } from "./planning.ts";

export const MAX_ID = 64;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const longDate = (d: IsoDate) =>
  `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export interface EventView extends EventCandidate {
  classifications: EventClassification[];
  /** Her lessons it would hit if she confirmed it for her usual groups, every date, all day. */
  lessons: number;
}

export function listEvents(repos: Repos): EventView[] {
  const { candidates, classifications, allSlots, groups } = loadPlanning(repos);
  return candidates.map((c) => {
    const draft: EventClassification = {
      id: "preview",
      wordingKey: c.wordingKey,
      yearGroup: c.yearGroup,
      onlyDates: null,
      decision: "cancels",
      groupIds: null,
      periods: null,
      until: null,
      provenance: "teacher",
    };
    return {
      ...c,
      classifications: classifications.filter(
        (k) => k.wordingKey === c.wordingKey && k.yearGroup === c.yearGroup,
      ),
      lessons: lessonsHitBy(
        disruptionsFromEvents([c], [draft], groups),
        allSlots,
        groups,
      ).length,
    };
  });
}

export function listStale(repos: Repos): StaleClassification[] {
  const { candidates, classifications } = loadPlanning(repos);
  return staleClassifications(candidates, classifications);
}

export interface ClassificationInput {
  wordingKey: string;
  yearGroup: YearGroup | null;
  onlyDates: IsoDate[] | null;
  decision: "cancels" | "no-effect";
  groupIds: string[] | null;
  periods: Period[] | null;
  until: IsoDate | null;
}

const refuse = (code: string, message: string) =>
  new ApiError(422, code, message);

/** Stores her confirmation, or refuses it with the reason. Nothing is stored on a refusal. */
export function saveClassification(
  repos: Repos,
  id: string,
  input: ClassificationInput,
  now: Date,
): EventClassification {
  if (id.trim() === "" || [...id].length > MAX_ID)
    throw refuse("bad-id", `The id must be 1 to ${MAX_ID} characters.`);
  const { candidates, groups, classifications } = loadPlanning(repos);
  const candidate = candidates.find(
    (c) => c.wordingKey === input.wordingKey && c.yearGroup === input.yearGroup,
  );
  if (!candidate)
    throw refuse(
      "no-such-event",
      "That event is not in the calendar (it may have been reworded).",
    );
  const onlyDates =
    input.onlyDates === null ? null : [...new Set(input.onlyDates)].sort();
  if (onlyDates !== null) {
    if (onlyDates.length === 0)
      throw refuse("no-dates", "Choose at least one date.");
    const unknown = onlyDates.filter((d) => !candidate.dates.includes(d));
    if (unknown.length > 0)
      throw refuse(
        "unknown-date",
        `The event is not on ${unknown.map(longDate).join(", ")}.`,
      );
  }
  const cancels = input.decision === "cancels";
  let groupIds: string[] | null = null;
  let periods: Period[] | null = null;
  if (cancels && input.groupIds !== null) {
    groupIds = [...new Set(input.groupIds)].sort();
    if (groupIds.length === 0)
      throw refuse("no-groups", "Choose at least one group.");
    const known = new Map(groups.map((g) => [g.id, g.yearGroup]));
    for (const g of groupIds) {
      if (!known.has(g))
        throw refuse("unknown-group", `There is no group ${g}.`);
      if (candidate.yearGroup !== null && known.get(g) !== candidate.yearGroup)
        throw refuse(
          "group-not-in-year",
          `${g} is not in Year ${candidate.yearGroup}.`,
        );
    }
  }
  if (cancels && input.periods !== null) {
    periods = [...new Set(input.periods)].sort((a, b) => a - b);
    if (periods.length === 0)
      throw refuse("no-periods", "Choose at least one period, or All day.");
  }
  if (!cancels && input.until !== null)
    throw refuse(
      "until-no-effect",
      "Only a cancellation can last until a date.",
    );
  const saved: EventClassification = {
    id,
    wordingKey: input.wordingKey,
    yearGroup: input.yearGroup,
    onlyDates,
    decision: input.decision,
    groupIds,
    periods,
    until: input.until,
    provenance: "teacher",
  };
  const last = [...keptDates(candidate, saved)].sort().at(-1);
  if (saved.until !== null && last !== undefined && saved.until < last)
    throw refuse(
      "until-before-date",
      `The end date is before ${longDate(last)}.`,
    );
  const conflict = classificationConflicts(candidates, [
    ...classifications.filter((k) => k.id !== id),
    saved,
  ]).find((c) => c.a === id || c.b === id);
  if (conflict)
    throw new ApiError(
      409,
      "overlapping-confirmation",
      `You already decided what "${candidate.text}" does on ${longDate(conflict.date)}. Change or undo that one first.`,
    );
  repos.events.upsert(saved, now.toISOString());
  return saved;
}

export function removeClassification(repos: Repos, id: string): void {
  if (!repos.events.remove(id))
    throw new ApiError(
      404,
      "no-such-confirmation",
      "There is no such confirmation to undo.",
    );
}
