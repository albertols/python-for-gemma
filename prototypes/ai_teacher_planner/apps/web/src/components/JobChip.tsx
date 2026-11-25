import {
  chipView,
  liveRun,
  useAiRuns,
  useCancelJob,
  useJob,
} from "../api/jobs.ts";
import { useConfig } from "../api/queries.ts";
import { Button } from "./ui/button.tsx";

/** In the header: the running job and its latest note with a way to stop it, or why the AI is off. */
export function JobChip() {
  const config = useConfig();
  const runs = useAiRuns();
  const cancel = useCancelJob();
  const live = liveRun(runs.data ?? []);
  const job = useJob(live?.id ?? null);
  const view = config.data
    ? chipView(config.data.ai, live, job.note)
    : { kind: "idle" as const };

  // The live region stays on the page so a change in it is read out.
  return (
    <div aria-live="polite" className="text-sm">
      {view.kind === "idle" ? null : (
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
          <span aria-hidden="true" className="text-ai">
            ✦
          </span>
          <span>{view.text}</span>
          {view.kind === "working" ? (
            <Button
              type="button"
              className="px-2 py-0.5"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(view.runId)}
            >
              Cancel AI job
            </Button>
          ) : null}
          {cancel.error ? (
            <span className="text-danger">{cancel.error.message}</span>
          ) : null}
        </span>
      )}
    </div>
  );
}
