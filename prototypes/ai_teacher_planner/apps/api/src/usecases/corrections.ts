import {
  canCorrectLabel,
  DEFAULT_NO_LESSONS_REASON,
  type FindingResolution,
  type IsoDate,
  type LabelCorrection,
  type ResolutionDecision,
  type WeekLabel,
} from "@planner/domain";
import { isSettleable } from "@planner/importers";
import { ApiError } from "../errors.ts";
import type { Repos, StoredDisruption } from "../repos/ports.ts";
import { MAX_REASON } from "./disruptions.ts";

export const NOTHING_TO_SETTLE = "There is nothing to settle on that date";

/** The id and batch of the whole-school cancellation behind a "no lessons" decision. */
export const dayBatch = (date: IsoDate) => `day:${date}`;

/** Free text she typed: at most 200 characters, kept as given, nothing when blank. */
function freeText(text: string | null, what: string): string | null {
  if (text === null || text.trim() === "") return null;
  if ([...text].length > MAX_REASON)
    throw new ApiError(
      422,
      "text-too-long",
      `${what} can be at most ${MAX_REASON} characters.`,
    );
  return text;
}

export function setLabelCorrection(
  repos: Repos,
  input: { date: IsoDate; weekLabel: WeekLabel; note: string | null },
  now: Date,
): LabelCorrection {
  const row = repos.calendar.rows().find((r) => r.date === input.date);
  if (!row || !canCorrectLabel(input.date, repos.settings.terms()))
    throw new ApiError(
      422,
      "cannot-correct-label",
      "You can only change the week label of a weekday in term that is in the calendar.",
    );
  if (row.weekLabel === input.weekLabel)
    throw new ApiError(
      422,
      "same-label",
      "That is already the calendar's label",
    );
  const correction: LabelCorrection = {
    date: input.date,
    weekLabel: input.weekLabel,
    note: freeText(input.note, "The note"),
  };
  repos.corrections.setLabel(correction, now.toISOString());
  return correction;
}

export function removeLabelCorrection(repos: Repos, date: IsoDate): void {
  if (!repos.corrections.removeLabel(date))
    throw new ApiError(
      404,
      "no-such-correction",
      "There is no correction on that date to remove.",
    );
}

/** The import finding that her decision settles: a possible day off or a labelled holiday on that date. */
function hasSettleableFinding(repos: Repos, date: IsoDate): boolean {
  return (repos.calendar.latestImport()?.findings ?? []).some(
    (f) => f.date === date && isSettleable(f),
  );
}

export function setResolution(
  repos: Repos,
  input: { date: IsoDate; decision: ResolutionDecision; reason: string | null },
  now: Date,
): FindingResolution {
  if (!hasSettleableFinding(repos, input.date))
    throw new ApiError(422, "nothing-to-settle", NOTHING_TO_SETTLE);
  const resolution: FindingResolution = {
    date: input.date,
    decision: input.decision,
    reason: freeText(input.reason, "The reason"),
  };
  const createdAt = now.toISOString();
  repos.transaction(() => {
    repos.disruptions.removeBatch(dayBatch(input.date));
    repos.corrections.setResolution(resolution, createdAt);
    if (resolution.decision === "no-lessons") {
      const row: StoredDisruption = {
        id: dayBatch(input.date),
        batchId: dayBatch(input.date),
        scope: { kind: "school" },
        from: input.date,
        to: input.date,
        periods: null,
        effect: "cancelled",
        reason: resolution.reason ?? DEFAULT_NO_LESSONS_REASON,
        source: "teacher",
        createdAt,
      };
      repos.disruptions.add([row]);
    }
  });
  return resolution;
}

/** Undoing a decision puts the lessons back exactly as before. */
export function removeResolution(repos: Repos, date: IsoDate): void {
  repos.transaction(() => {
    if (!repos.corrections.removeResolution(date))
      throw new ApiError(
        404,
        "no-such-resolution",
        "There is no decision on that date to undo.",
      );
    repos.disruptions.removeBatch(dayBatch(date));
  });
}
