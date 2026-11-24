import {
  canCorrectLabel,
  checkLabels,
  type IsoDate,
  staleClassifications,
  termSpanning,
  toCalendarDays,
} from "@planner/domain";
import {
  dayOffFindings,
  type ImportFinding,
  isSettleable,
  readCalendarWorkbook,
  readParentsEvenings,
  readReportDeadlines,
  type TidyReport,
  tidyFindings,
} from "@planner/importers";
import { ApiError } from "../errors.ts";
import {
  ResourceDenied,
  type ResourceGateway,
} from "../gateway/resource-gateway.ts";
import type {
  Repos,
  StoredParentsEvening,
  StoredReportWindow,
} from "../repos/ports.ts";
import { longDate } from "./calendar-events.ts";
import { loadPlanning } from "./planning.ts";

export interface ReportIssue {
  /** The id of the stored report window or parents' evening. */
  id: string;
  kind: "report-window" | "parents-evening";
  label: string;
  field: "dataDeadline" | "hodReview" | "sentHome" | "date";
  raw: string;
}
/** A correction or decision that no longer fits the calendar. It keeps its effect until she removes it. */
export interface StaleCorrection {
  type: "label" | "resolution";
  date: IsoDate;
  message: string;
}
/** A confirmation of a calendar event whose wording or dates the calendar no longer has. */
export interface StaleEvent {
  /** The id of the stored confirmation, to remove it. */
  id: string;
  message: string;
}
export interface ImportSummary extends TidyReport {
  ok: boolean;
  staleCorrections: StaleCorrection[];
  staleEvents: StaleEvent[];
  counts: { W1: number; W2: number };
  reportIssues: ReportIssue[];
  importedAt: string | null;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cmpDate = compare;

function reportIssuesOf(
  windows: readonly StoredReportWindow[],
  evenings: readonly StoredParentsEvening[],
): ReportIssue[] {
  const issues: ReportIssue[] = [];
  for (const w of windows) {
    const label = `Year ${w.yearGroup}${w.programme ? ` ${w.programme}` : ""} ${w.name}`;
    const fields = ["dataDeadline", "hodReview", "sentHome"] as const;
    for (const field of fields) {
      const raw = w.raw[field];
      if (raw !== null && w[field] === null)
        issues.push({ id: w.id, kind: "report-window", label, field, raw });
    }
  }
  for (const e of evenings)
    if (e.raw !== null && e.date === null)
      issues.push({
        id: e.id,
        kind: "parents-evening",
        label:
          e.yearGroup === null ? e.label : `Year ${e.yearGroup} ${e.label}`,
        field: "date",
        raw: e.raw,
      });
  return issues.sort(
    (a, b) =>
      compare(a.kind, b.kind) ||
      compare(a.label, b.label) ||
      compare(a.id, b.id) ||
      compare(a.field, b.field),
  );
}

/**
 * The latest stored import, tidied with her decisions, or null when nothing has
 * been imported. The stored findings are the importer's own; her corrections
 * and decisions are applied here, so they survive a new import.
 */
export function importSummary(repos: Repos): ImportSummary | null {
  const latest = repos.calendar.latestImport();
  if (latest === null) return null;
  const rows = repos.calendar.rows();
  const labels = repos.corrections.labels();
  const resolutions = repos.corrections.resolutions();
  const days = toCalendarDays(rows, repos.settings.terms(), labels);
  const counts = { W1: 0, W2: 0 };
  for (const d of days) if (d.weekLabel !== null) counts[d.weekLabel] += 1;

  // A week she has fixed is no longer mixed: keep only the label issues that still hold.
  const stillMixed = new Set(
    checkLabels(toCalendarDays(rows, termSpanning(rows), labels)).map(
      (i) => `${i.weekOf} ${i.detail}`,
    ),
  );
  const current = latest.findings.filter(
    (f) => f.kind !== "label-issue" || stillMixed.has(`${f.date} ${f.message}`),
  );
  const tidy = tidyFindings(current, repos.settings.terms(), resolutions);

  const terms = repos.settings.terms();
  const known = new Set(rows.map((r) => r.date));
  const settleable = new Set(
    latest.findings.filter(isSettleable).map((f) => f.date),
  );
  const gone = (date: IsoDate) =>
    `Your correction for ${date} no longer matches a day in the calendar`;
  const staleCorrections: StaleCorrection[] = [
    ...labels.flatMap((c): StaleCorrection[] =>
      !known.has(c.date)
        ? [{ type: "label", date: c.date, message: gone(c.date) }]
        : !canCorrectLabel(c.date, terms)
          ? [
              {
                type: "label",
                date: c.date,
                message: `Your correction for ${c.date} is no longer on a weekday in term`,
              },
            ]
          : [],
    ),
    ...resolutions.flatMap((r): StaleCorrection[] =>
      !known.has(r.date)
        ? [{ type: "resolution", date: r.date, message: gone(r.date) }]
        : !settleable.has(r.date)
          ? [
              {
                type: "resolution",
                date: r.date,
                message: `Your decision for ${r.date} no longer matches a note in the calendar`,
              },
            ]
          : [],
    ),
  ].sort((a, b) => cmpDate(a.date, b.date) || cmpDate(a.type, b.type));
  const planning = loadPlanning(repos);
  const staleEvents: StaleEvent[] = staleClassifications(
    planning.candidates,
    planning.classifications,
  ).map(({ classification: k, candidateGone, missingDates }) => ({
    id: k.id,
    message: candidateGone
      ? `Your confirmation of "${k.wordingKey}"${k.yearGroup === null ? "" : ` for Year ${k.yearGroup}`} no longer matches an event in the calendar, so it cancels no lessons`
      : `Your confirmation of "${k.wordingKey}"${k.yearGroup === null ? "" : ` for Year ${k.yearGroup}`} names ${missingDates.map(longDate).join(", ")}, which the calendar no longer has for it`,
  }));
  const staleFindings = [
    ...staleCorrections.map(
      (s): ImportFinding => ({
        kind: "orphaned-correction",
        severity: "error",
        sheetRow: null,
        date: s.date,
        message: s.message,
      }),
    ),
    ...staleEvents.map(
      (s): ImportFinding => ({
        kind: "orphaned-correction",
        severity: "error",
        sheetRow: null,
        date: null,
        message: s.message,
      }),
    ),
  ];
  const shown = [...tidy.shown, ...staleFindings];
  return {
    ok: true,
    shown,
    outsideYear: tidy.outsideYear,
    resolved: tidy.resolved,
    staleCorrections,
    staleEvents,
    counts,
    reportIssues: reportIssuesOf(
      repos.calendar.windows(),
      repos.calendar.evenings(),
    ),
    importedAt: latest.importedAt,
  };
}

async function readWorkbook(
  gateway: ResourceGateway,
): Promise<{ name: string; bytes: Uint8Array }> {
  let names: string[];
  try {
    names = (await gateway.find("calendar-workbook")).sort(compare);
  } catch (err) {
    if (!(err instanceof ResourceDenied)) throw err;
    names = [];
  }
  if (names.length === 0)
    throw new ApiError(
      422,
      "no-calendar-workbook",
      'I could not find the school calendar. Put one Excel file whose name contains "Secondary Calendar" into the resources folder, then try again.',
    );
  const [name] = names;
  if (names.length > 1 || name === undefined)
    throw new ApiError(
      422,
      "several-calendar-workbooks",
      `I found ${names.length} calendar workbooks: ${names.join(", ")}. Keep only the one you want in the resources folder, then try again.`,
    );
  try {
    return { name, bytes: await gateway.read(name) };
  } catch (err) {
    if (!(err instanceof ResourceDenied)) throw err;
    throw new ApiError(
      422,
      "calendar-workbook-unreadable",
      `I could not open "${name}". Check that it is a normal Excel file that is not too large, then try again.`,
    );
  }
}

const rawOrNull = (raw: string) => (raw === "" ? null : raw);

/**
 * Reads the workbook through the gateway. When it is sound, replaces the
 * stored calendar, report windows and parents' evenings in one transaction.
 */
export async function importCalendar(deps: {
  gateway: ResourceGateway;
  repos: Repos;
  now: () => Date;
}): Promise<ImportSummary> {
  const { gateway, repos, now } = deps;
  const { name, bytes } = await readWorkbook(gateway);
  const read = await readCalendarWorkbook(bytes);
  if (!read.ok || read.academicYear === null)
    return {
      ok: false,
      shown: read.findings,
      outsideYear: [],
      resolved: [],
      staleCorrections: [],
      staleEvents: [],
      counts: { W1: 0, W2: 0 },
      reportIssues: [],
      importedAt: null,
    };

  const year = read.academicYear;
  // Needs the terms, which the workbook reader does not know.
  const findings = [
    ...read.findings,
    ...dayOffFindings(read.rows, repos.settings.terms()),
  ];
  const windows = (await readReportDeadlines(bytes, year)).map(
    (w, i): StoredReportWindow => ({
      id: `rw-${String(i + 1).padStart(3, "0")}`,
      yearGroup: w.yearGroup,
      programme: w.programme,
      name: w.name,
      dataDeadline: w.dataDeadline.date,
      hodReview: w.hodReview.date,
      sentHome: w.sentHome.date,
      raw: {
        dataDeadline: rawOrNull(w.dataDeadline.raw),
        hodReview: rawOrNull(w.hodReview.raw),
        sentHome: rawOrNull(w.sentHome.raw),
      },
    }),
  );
  const evenings = (await readParentsEvenings(bytes, year)).map(
    (e, i): StoredParentsEvening => ({
      id: `pe-${String(i + 1).padStart(3, "0")}`,
      yearGroup: e.yearGroup,
      label: e.label,
      date: e.date.date,
      raw: rawOrNull(e.date.raw),
    }),
  );

  repos.calendar.replaceCalendar({
    file: {
      fileName: name,
      fileHash: read.fileHash,
      importedAt: now().toISOString(),
      findings,
    },
    rows: read.rows,
    windows,
    evenings,
  });
  const summary = importSummary(repos);
  if (summary === null) throw new Error("The import was not stored.");
  return summary;
}
