import {
  buildSlots,
  type Disruption,
  type DisruptionScope,
  type IsoDate,
  type Period,
  type YearGroup,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos, StoredDisruption } from "../repos/ports.ts";
import { loadPlanning } from "./planning.ts";

export const NO_LESSONS = "No lessons fall in these dates";
export const MAX_REASON = 200;

export interface DisruptionInput {
  scope: "school" | "year" | "groups";
  yearGroup?: YearGroup | undefined;
  groupIds?: string[] | undefined;
  from: IsoDate;
  to: IsoDate;
  periods: Period[] | null;
  reason: string;
}

export interface Hit {
  groupId: string;
  date: IsoDate;
  period: Period;
}

/** The rows a cancellation would store, without ids that belong to a stored batch. Refuses what makes no sense. */
function candidates(
  repos: Repos,
  input: DisruptionInput,
  ids: () => string,
): Disruption[] {
  if (input.to < input.from)
    throw new ApiError(
      422,
      "range-backwards",
      "The last day is before the first day.",
    );
  if (input.periods !== null && input.periods.length === 0)
    throw new ApiError(
      422,
      "no-periods",
      "Choose at least one period, or All day.",
    );
  const scopes: DisruptionScope[] = [];
  if (input.scope === "school") scopes.push({ kind: "school" });
  else if (input.scope === "year") {
    if (input.yearGroup === undefined)
      throw new ApiError(422, "no-year", "Choose a year.");
    scopes.push({ kind: "year", yearGroup: input.yearGroup });
  } else {
    const chosen = [...new Set(input.groupIds ?? [])];
    if (chosen.length === 0)
      throw new ApiError(422, "no-groups", "Choose at least one group.");
    const known = new Set(repos.timetable.groups().map((g) => g.id));
    const unknown = chosen.filter((g) => !known.has(g));
    if (unknown.length > 0)
      throw new ApiError(
        422,
        "unknown-group",
        `There is no group ${unknown.join(", ")}.`,
      );
    for (const groupId of chosen) scopes.push({ kind: "group", groupId });
  }
  const periods =
    input.periods === null
      ? null
      : [...new Set(input.periods)].sort((a, b) => a - b);
  return scopes.map((scope) => ({
    id: ids(),
    scope,
    from: input.from,
    to: input.to,
    periods,
    effect: "cancelled",
    reason: input.reason,
    source: "teacher",
  }));
}

/** The lessons these rows would cancel, by the engine's own rule, so a preview and a save always agree. */
function lessonsHit(repos: Repos, rows: Disruption[]): Hit[] {
  const { days, timetables, groups } = loadPlanning(repos);
  return buildSlots({ days, timetables, groups, disruptions: rows })
    .filter((s) => s.status === "cancelled")
    .map((s) => ({ groupId: s.groupId, date: s.date, period: s.period }));
}

/** Stores nothing. The reason is not checked yet: she may still be typing it. */
export function previewDisruption(repos: Repos, input: DisruptionInput): Hit[] {
  return lessonsHit(
    repos,
    candidates(repos, input, () => "preview"),
  );
}

export function createDisruption(
  repos: Repos,
  input: DisruptionInput,
  now: Date,
): StoredDisruption[] {
  const reason = input.reason;
  if (reason.trim() === "")
    throw new ApiError(
      422,
      "reason-empty",
      "Say why the lessons were cancelled.",
    );
  if ([...reason].length > MAX_REASON)
    throw new ApiError(
      422,
      "reason-too-long",
      `The reason can be at most ${MAX_REASON} characters.`,
    );
  const batchId = crypto.randomUUID();
  const createdAt = now.toISOString();
  const rows = candidates(repos, input, () => `t:${crypto.randomUUID()}`).map(
    (d): StoredDisruption => ({ ...d, batchId, createdAt }),
  );
  if (lessonsHit(repos, rows).length === 0)
    throw new ApiError(422, "no-lessons", NO_LESSONS);
  repos.disruptions.add(rows);
  return rows;
}
