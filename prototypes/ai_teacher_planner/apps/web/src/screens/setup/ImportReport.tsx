import { useRef, useState } from "react";
import type { ImportSummary, ReportIssue } from "../../api/queries.ts";
import { useSaveReportDate } from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { longDate } from "./dates.ts";

type Finding = ImportSummary["findings"][number];

function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {findings.map((f) => (
        <li key={`${f.kind}-${f.sheetRow}-${f.date}-${f.message}`}>
          {f.date ? (
            <strong>{longDate(f.date)}</strong>
          ) : (
            <strong>Sheet</strong>
          )}
          {f.sheetRow !== null ? ` (row ${f.sheetRow})` : ""}: {f.message}
        </li>
      ))}
    </ul>
  );
}

/** Findings by severity: errors first, then warnings, then the quiet ones. */
export function ImportReport({ summary }: { summary: ImportSummary }) {
  const errors = summary.findings.filter((f) => f.severity === "error");
  const warnings = summary.findings.filter((f) => f.severity === "warning");
  const info = summary.findings.filter((f) => f.severity === "info");
  return (
    <div className="mt-4 space-y-4">
      {errors.length > 0 ? (
        <section
          aria-labelledby="report-errors"
          className="rounded-lg border border-border p-3"
        >
          <h3 id="report-errors" className="font-semibold text-danger">
            Errors
          </h3>
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
          <h3 id="report-warnings" className="font-semibold">
            Warnings
          </h3>
          <FindingList findings={warnings} />
        </section>
      ) : null}
      {info.length > 0 ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer font-semibold">
            Outside the school year ({info.length})
          </summary>
          <FindingList findings={info} />
        </details>
      ) : null}
      {summary.findings.length === 0 ? (
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
        Report dates that need her
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
