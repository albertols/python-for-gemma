import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client.ts";
import {
  type ImportPreview,
  useImportPreview,
  useImportSources,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { Loading } from "../../components/ui/states.tsx";

const FIELD =
  "rounded-md border border-border bg-background px-2 py-1 text-foreground";
const SEVERITY = { error: "Problem", warning: "Check", info: "Note" } as const;

/** Why a preview could not be made, in the planner's own sentence. */
function failureText(error: unknown): string {
  if (error instanceof ApiError)
    return [error.message, ...error.issues].join(" ");
  return "The planner could not be reached.";
}

/**
 * Her planning sheet, read as a scheme of work. Choosing files shows a preview of what would
 * change and what the files raise; the scheme is stored only when she accepts.
 */
export function ImportSchemeDialog({
  courseId,
  saving,
  failure,
  onAccept,
  onClose,
}: {
  courseId: string;
  saving: boolean;
  /** Why the last attempt to store the imported scheme failed, if it did. */
  failure: string | null;
  onAccept: (preview: ImportPreview) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const sources = useImportSources(courseId, true);
  const preview = useImportPreview(courseId);
  const [planning, setPlanning] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<string>("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const files = sources.data;
  const chosenPlanning = planning ?? files?.planning[0] ?? null;
  const result = preview.data;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground backdrop:bg-black/60"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        Import from my planning sheet
      </h2>
      <p className="mt-1 text-muted-foreground">
        This shows what the files say and what would change. Nothing is saved
        until you use the imported scheme.
      </p>
      {sources.error ? (
        <p role="alert" className="mt-3 text-danger">
          The planning files could not be listed.
        </p>
      ) : !files ? (
        <div className="mt-3">
          <Loading what="the planning files" />
        </div>
      ) : files.planning.length === 0 ? (
        <p className="mt-3">
          No planning sheet was found in this course's Planning folder.
        </p>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (chosenPlanning)
              preview.mutate({
                planningFile: chosenPlanning,
                scheduleFile: schedule === "" ? null : schedule,
              });
          }}
        >
          <label className="flex flex-col text-sm">
            Planning sheet
            <select
              value={chosenPlanning ?? ""}
              className={FIELD}
              onChange={(e) => setPlanning(e.target.value)}
            >
              {files.planning.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Assessment schedule
            <select
              value={schedule}
              className={FIELD}
              onChange={(e) => setSchedule(e.target.value)}
            >
              <option value="">None</option>
              {files.schedules.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={preview.isPending}>
            Show preview
          </Button>
        </form>
      )}
      {preview.error ? (
        <p role="alert" className="mt-3 text-danger">
          {failureText(preview.error)}
        </p>
      ) : null}
      {result ? (
        <div className="mt-4 space-y-4">
          <section aria-labelledby={`${titleId}-findings`}>
            <h3 id={`${titleId}-findings`} className="font-semibold">
              What the files raise
            </h3>
            {result.findings.length === 0 ? (
              <p>Nothing.</p>
            ) : (
              <ul
                aria-label="What the files raise"
                className="mt-1 list-disc space-y-1 pl-5"
              >
                {result.findings.map((f, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same sentence can be listed twice
                  <li key={`${i}-${f.message}`}>
                    <strong>{SEVERITY[f.severity]}:</strong> {f.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {result.keptAssessments > 0 ? (
            <p>Assessments kept (no schedule chosen)</p>
          ) : null}
          <section aria-labelledby={`${titleId}-changes`}>
            <h3 id={`${titleId}-changes`} className="font-semibold">
              What would change in your scheme
            </h3>
            {result.changes.length === 0 ? (
              <p>Nothing in your scheme would change.</p>
            ) : (
              <ul
                aria-label="What would change"
                className="mt-1 list-disc space-y-1 pl-5"
              >
                {result.changes.map((c) => (
                  <li key={c.id}>
                    {c.title}: {c.change}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {failure ? (
            <p role="alert" className="text-danger">
              {failure}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {result ? (
          <Button
            type="button"
            variant="primary"
            disabled={saving || result.changes.length === 0}
            onClick={() => onAccept(result)}
          >
            Use the imported scheme
          </Button>
        ) : null}
        <Button type="button" onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </div>
    </dialog>
  );
}
