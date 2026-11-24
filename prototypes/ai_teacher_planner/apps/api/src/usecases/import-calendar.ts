import {
  checkLabels,
  type IsoDate,
  termSpanning,
  toCalendarDays,
} from "@planner/domain";
import {
  dayOffFindings,
  type ImportFinding,
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

export interface ReportIssue {
  /** The id of the stored report window or parents' evening. */
  id: string;
  kind: "report-window" | "parents-evening";
  label: string;
  field: "dataDeadline" | "hodReview" | "sentHome" | "date";
  raw: string;
}
/** A correction or decision whose date the calendar no longer has. Kept until she removes it. */
export interface StaleCorrection {
  type: "label" | "resolution";
  date: IsoDate;
}
export interface ImportSummary extends TidyReport {
  ok: boolean;
  staleCorrections: StaleCorrection[];
  counts: { W1: number; W2: number };
  reportIssues: ReportIssue[];
  importedAt: string | null;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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

const staleMessage = (date: IsoDate) =>
  `Your correction for ${date} no longer matches a day in the calendar`;

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

  const known = new Set(rows.map((r) => r.date));
  const staleCorrections: StaleCorrection[] = [
    ...labels.map((c) => ({ type: "label" as const, date: c.date })),
    ...resolutions.map((r) => ({ type: "resolution" as const, date: r.date })),
  ].filter((s) => !known.has(s.date));
  const stale = [...new Set(staleCorrections.map((s) => s.date))].sort();
  const staleFindings = stale.map(
    (date): ImportFinding => ({
      kind: "orphaned-correction",
      severity: "error",
      sheetRow: null,
      date,
      message: staleMessage(date),
    }),
  );
  const shown = [...tidy.shown, ...staleFindings];
  return {
    ok: true,
    shown,
    outsideYear: tidy.outsideYear,
    resolved: tidy.resolved,
    staleCorrections,
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
