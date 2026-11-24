import { useImportSummary, useRunImport } from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { ErrorState, Loading } from "../../components/ui/states.tsx";
import { ImportReport, ReportDates } from "./ImportReport.tsx";

export function CalendarImportCard() {
  const current = useImportSummary();
  const run = useRunImport();
  return (
    <section
      aria-labelledby="calendar-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="calendar-title" className="text-xl font-semibold">
        School calendar
      </h2>
      <div className="mt-3">
        <Button
          type="button"
          variant="primary"
          disabled={run.isPending}
          onClick={() => run.mutate()}
        >
          Import the school calendar
        </Button>
      </div>
      {run.isError ? (
        <div className="mt-3">
          <ErrorState
            title="The calendar was not imported"
            message={run.error.message}
          />
        </div>
      ) : null}
      {current.isPending ? <Loading what="the last import" /> : null}
      {current.isError ? <ErrorState message={current.error.message} /> : null}
      {current.data === null ? (
        <p className="mt-3 text-muted-foreground">
          The calendar has not been imported yet.
        </p>
      ) : null}
      {current.data ? (
        <>
          {current.data.importedAt ? (
            <p className="mt-3">
              Imported on{" "}
              {new Date(current.data.importedAt).toLocaleString("en-GB")}
            </p>
          ) : null}
          <ul className="mt-2 flex gap-6">
            <li>Week 1: {current.data.counts.W1} days</li>
            <li>Week 2: {current.data.counts.W2} days</li>
          </ul>
          <ImportReport summary={current.data} />
          <ReportDates issues={current.data.reportIssues} />
        </>
      ) : null}
    </section>
  );
}
