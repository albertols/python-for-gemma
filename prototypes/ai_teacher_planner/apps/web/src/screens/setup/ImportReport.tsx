import { useRef, useState } from "react";
import type { ImportSummary, ReportIssue } from "../../api/queries.ts";
import {
  useRemoveLabel,
  useRemoveResolution,
  useSaveReportDate,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { longDate } from "../../lib/dates.ts";
import { ChangeLabel, SettleButtons } from "./FindingActions.tsx";

type Finding = ImportSummary["shown"][number];

function Where({ f }: { f: Finding }) {
  return (
    <>
      <strong>{f.date ? longDate(f.date) : "Sheet"}</strong>
      {f.sheetRow !== null ? ` (row ${f.sheetRow})` : ""}: {f.message}
    </>
  );
}

function FindingList({
  findings,
  onDone,
  settle = false,
}: {
  findings: Finding[];
  onDone?: (message: string) => void;
  /** Offer "I have lessons" and "No lessons" on a possible day off. */
  settle?: boolean;
}) {
  return (
    <ul className="mt-2 space-y-3">
      {findings.map((f) => (
        <li key={`${f.kind}-${f.sheetRow}-${f.date}-${f.message}`}>
          <Where f={f} />
          {onDone && f.date ? (
            <>
              {settle && f.kind === "possible-day-off" ? (
                <SettleButtons finding={f} onDone={onDone} />
              ) : null}
              <ChangeLabel date={f.date} onDone={onDone} />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function decisionText(r: Summary["resolved"][number]["resolution"]): string {
  if (r.decision === "teaching-day") return "You have lessons that day.";
  return `No lessons that day: ${r.reason ?? "No lessons (your correction)"}.`;
}

type Summary = ImportSummary;

/** Her decisions, each with Undo. */
function Resolved({
  items,
  onDone,
}: {
  items: Summary["resolved"];
  onDone: (message: string) => void;
}) {
  const undo = useRemoveResolution();
  return (
    <section
      aria-labelledby="report-resolved"
      className="rounded-lg border border-border p-3"
    >
      <h3 id="report-resolved" className="font-semibold">
        Resolved
      </h3>
      <ul className="mt-2 space-y-3">
        {items.map(({ finding, resolution }) => (
          <li key={`${finding.kind}-${finding.date}`}>
            <Where f={finding} /> <span>{decisionText(resolution)}</span>
            <div className="mt-1">
              <Button
                type="button"
                disabled={undo.isPending}
                aria-label={`Undo: ${longDate(resolution.date)}`}
                onClick={() =>
                  undo.mutate(resolution.date, {
                    onSuccess: () =>
                      onDone(
                        `${longDate(resolution.date)}: your decision is undone.`,
                      ),
                  })
                }
              >
                Undo
              </Button>
            </div>
            <ChangeLabel date={resolution.date} onDone={onDone} />
          </li>
        ))}
      </ul>
      {undo.isError ? (
        <p role="alert" className="mt-2 text-danger">
          {undo.error.message}
        </p>
      ) : null}
    </section>
  );
}

/** Corrections and decisions whose date a new import no longer has. */
function Stale({
  summary,
  onDone,
}: {
  summary: Summary;
  onDone: (message: string) => void;
}) {
  const removeLabel = useRemoveLabel();
  const removeResolution = useRemoveResolution();
  return (
    <section
      aria-labelledby="report-stale"
      className="rounded-lg border border-border p-3"
    >
      <h3 id="report-stale" className="font-semibold text-danger">
        Your corrections that no longer match
      </h3>
      <ul className="mt-2 space-y-2">
        {summary.staleCorrections.map((s) => (
          <li key={`${s.type}-${s.date}`}>
            Your {s.type === "label" ? "week label correction" : "decision"} for{" "}
            <strong>{longDate(s.date)}</strong> no longer matches a day in the
            calendar.{" "}
            <Button
              type="button"
              aria-label={`Remove your ${s.type === "label" ? "correction" : "decision"} for ${longDate(s.date)}`}
              onClick={() =>
                (s.type === "label" ? removeLabel : removeResolution).mutate(
                  s.date,
                  {
                    onSuccess: () => onDone(`${longDate(s.date)}: removed.`),
                  },
                )
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the import found: errors, warnings you can settle, notes, and what is folded away. */
export function ImportReport({ summary }: { summary: ImportSummary }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [done, setDone] = useState<string | null>(null);
  const onDone = (message: string) => {
    setDone(message);
    heading.current?.focus();
  };
  const isStale = (f: Finding) => f.kind === "orphaned-correction";
  const errors = summary.shown.filter(
    (f) => f.severity === "error" && !isStale(f),
  );
  const warnings = summary.shown.filter((f) => f.severity === "warning");
  const notes = summary.shown.filter(
    (f) => f.severity === "info" && !isStale(f),
  );
  const quiet =
    summary.shown.length === 0 &&
    summary.outsideYear.length === 0 &&
    summary.resolved.length === 0;
  return (
    <div className="mt-4 space-y-4">
      <h3
        ref={heading}
        tabIndex={-1}
        className="font-semibold outline-offset-2"
      >
        What the import found
      </h3>
      {done ? <p role="status">{done}</p> : null}
      {summary.staleCorrections.length > 0 ? (
        <Stale summary={summary} onDone={onDone} />
      ) : null}
      {errors.length > 0 ? (
        <section
          aria-labelledby="report-errors"
          className="rounded-lg border border-border p-3"
        >
          <h4 id="report-errors" className="font-semibold text-danger">
            Errors
          </h4>
          <p>
            Nothing was imported. Fix these in the workbook, then import again.
          </p>
          <FindingList findings={errors} />
        </section>
      ) : null}
      {warnings.length > 0 ? (
        <section
          aria-labelledby="report-warnings"
          className="rounded-lg border border-border p-3"
        >
          <h4 id="report-warnings" className="font-semibold">
            Warnings
          </h4>
          <FindingList findings={warnings} onDone={onDone} settle />
        </section>
      ) : null}
      {notes.length > 0 ? (
        <section
          aria-labelledby="report-notes"
          className="rounded-lg border border-border p-3"
        >
          <h4 id="report-notes" className="font-semibold">
            Notes
          </h4>
          <FindingList findings={notes} onDone={onDone} />
        </section>
      ) : null}
      {summary.resolved.length > 0 ? (
        <Resolved items={summary.resolved} onDone={onDone} />
      ) : null}
      {summary.outsideYear.length > 0 ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer font-semibold">
            Outside the school year: {summary.outsideYear.length}{" "}
            {summary.outsideYear.length === 1 ? "note" : "notes"} (not needed
            for planning)
          </summary>
          <FindingList findings={summary.outsideYear} />
        </details>
      ) : null}
      {quiet ? (
        <p className="text-muted-foreground">The import found nothing odd.</p>
      ) : null}
    </div>
  );
}

function IssueRow({
  issue,
  disabled,
  onSave,
}: {
  issue: ReportIssue;
  disabled: boolean;
  onSave: (issue: ReportIssue, date: string) => void;
}) {
  const [date, setDate] = useState("");
  const what =
    issue.kind === "report-window"
      ? `${issue.label}, ${issue.field}`
      : issue.label;
  return (
    <li className="flex flex-wrap items-center gap-3">
      <span>
        {what}: the sheet says <q>{issue.raw}</q>
      </span>
      <input
        type="date"
        aria-label={`Date for ${what}`}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-border bg-card px-2 py-1"
      />
      <Button
        type="button"
        disabled={date === "" || disabled}
        onClick={() => onSave(issue, date)}
      >
        Save this date
      </Button>
    </li>
  );
}

/** Report and parents' evening dates the importer could not read. */
export function ReportDates({ issues }: { issues: ReportIssue[] }) {
  // The save lives here, not in a row: the row disappears when its date is saved.
  const save = useSaveReportDate();
  const heading = useRef<HTMLHeadingElement>(null);
  if (issues.length === 0 && !save.isSuccess) return null;
  return (
    <section aria-labelledby="report-dates" className="mt-6">
      <h3
        id="report-dates"
        ref={heading}
        tabIndex={-1}
        className="font-semibold"
      >
        Report dates to check
      </h3>
      {save.isSuccess ? (
        <p role="status">
          Date saved.{" "}
          {issues.length === 0 ? "Every report date is now readable." : ""}
        </p>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {issues.map((i) => (
          <IssueRow
            key={`${i.id}-${i.field}`}
            issue={i}
            disabled={save.isPending}
            onSave={(issue, date) =>
              save.mutate(
                { issue, date },
                { onSuccess: () => heading.current?.focus() },
              )
            }
          />
        ))}
      </ul>
      <p className="mt-2 text-muted-foreground">
        If you import the calendar again, check these dates again.
      </p>
    </section>
  );
}
