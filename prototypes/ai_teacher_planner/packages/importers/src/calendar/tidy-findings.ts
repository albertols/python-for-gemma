import {
  type FindingResolution,
  type IsoDate,
  type Term,
  weekdayOf,
} from "@planner/domain";
import type { ImportFinding } from "./read-calendar.ts";

export interface TidyReport {
  /** What she still needs to look at, in the order given. */
  shown: ImportFinding[];
  /** Notes on a weekend or outside every term, folded away as `info`. */
  outsideYear: ImportFinding[];
  resolved: { finding: ImportFinding; resolution: FindingResolution }[];
}

/** The two kinds she can settle with "I have lessons that day" or "No lessons that day". */
const SETTLEABLE = new Set<ImportFinding["kind"]>([
  "possible-day-off",
  "labelled-holiday",
]);
export const isSettleable = (f: ImportFinding): boolean =>
  f.date !== null && SETTLEABLE.has(f.kind);

function outsideSchoolYear(date: IsoDate, terms: readonly Term[]): boolean {
  return (
    weekdayOf(date) >= 6 ||
    !terms.some((t) => date >= t.firstPupilDay && date <= t.lastPupilDay)
  );
}

/**
 * Sorts findings into what to show, what is not needed for planning and what
 * she has settled. A finding with no date always stays in `shown`.
 */
export function tidyFindings(
  findings: readonly ImportFinding[],
  terms: readonly Term[],
  resolutions: readonly FindingResolution[],
): TidyReport {
  const resolutionOn = new Map(resolutions.map((r) => [r.date, r]));
  const report: TidyReport = { shown: [], outsideYear: [], resolved: [] };
  for (const f of findings) {
    // Her own decision, kept until she removes it: never folded away.
    if (f.date === null || f.kind === "orphaned-correction") {
      report.shown.push(f);
      continue;
    }
    if (outsideSchoolYear(f.date, terms)) {
      report.outsideYear.push({ ...f, severity: "info" });
      continue;
    }
    const resolution = resolutionOn.get(f.date);
    if (resolution && SETTLEABLE.has(f.kind))
      report.resolved.push({ finding: f, resolution });
    else report.shown.push(f);
  }
  return report;
}
