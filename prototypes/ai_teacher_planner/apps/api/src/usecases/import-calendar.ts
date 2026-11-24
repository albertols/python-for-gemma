import {
  type ImportFinding,
  readCalendarWorkbook,
  readParentsEvenings,
  readReportDeadlines,
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
  kind: "report-window" | "parents-evening";
  label: string;
  field: "dataDeadline" | "hodReview" | "sentHome" | "date";
  raw: string;
}
export interface ImportSummary {
  ok: boolean;
  findings: ImportFinding[];
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
        issues.push({ kind: "report-window", label, field, raw });
    }
  }
  for (const e of evenings)
    if (e.raw !== null && e.date === null)
      issues.push({
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
      compare(a.field, b.field),
  );
}

/** The latest stored import, or null when nothing has been imported. */
export function importSummary(repos: Repos): ImportSummary | null {
  const latest = repos.calendar.latestImport();
  if (latest === null) return null;
  const counts = { W1: 0, W2: 0 };
  for (const r of repos.calendar.rows())
    if (r.weekLabel !== null) counts[r.weekLabel] += 1;
  return {
    ok: true,
    findings: latest.findings,
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
      findings: read.findings,
      counts: { W1: 0, W2: 0 },
      reportIssues: [],
      importedAt: null,
    };

  const year = read.academicYear;
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
      findings: read.findings,
    },
    rows: read.rows,
    windows,
    evenings,
  });
  const summary = importSummary(repos);
  if (summary === null) throw new Error("The import was not stored.");
  return summary;
}
