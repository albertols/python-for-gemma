import { useState } from "react";
import {
  type AiItemView,
  type AiRunView,
  countOf,
  describeItem,
  provenanceOf,
  useAiItems,
  useAiRuns,
  useReviewItem,
} from "../api/jobs.ts";
import { useConfig } from "../api/queries.ts";
import { whenOf } from "../lib/dates.ts";
import { AiBadge, aiOutline } from "./AiBadge.tsx";
import { ProvenancePopover } from "./ProvenancePopover.tsx";
import { ReviewBar } from "./ReviewBar.tsx";
import { Button } from "./ui/button.tsx";
import { Disclosure } from "./ui/disclosure.tsx";
import { EmptyState, ErrorState, Loading } from "./ui/states.tsx";

const MAX_LESSONS = 99;
const RECORDED =
  "Recorded. The scheme uses it once the scheme screen is built.";

const OUTCOME: Record<AiRunView["status"], string> = {
  queued: "Waiting its turn",
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function EditCount({
  item,
  onSave,
  onCancel,
}: {
  item: AiItemView;
  onSave: (data: unknown) => void;
  onCancel: () => void;
}) {
  const was = countOf(item) ?? 1;
  const [lessons, setLessons] = useState(String(was));
  const n = Number(lessons);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_LESSONS;
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...(item.data as object), to: n });
      }}
    >
      <label className="flex flex-col text-sm">
        Lessons
        <input
          type="number"
          min={1}
          max={MAX_LESSONS}
          step={1}
          value={lessons}
          onChange={(e) => setLessons(e.target.value)}
          className="w-24 rounded-md border border-border bg-background px-2 py-1"
        />
      </label>
      <Button type="submit" variant="primary" disabled={!valid}>
        Save edit
      </Button>
      <Button type="button" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function Suggestion({
  run,
  item,
  timeZone,
}: {
  run: AiRunView;
  item: AiItemView;
  timeZone: string;
}) {
  const review = useReviewItem();
  const [editing, setEditing] = useState(false);
  const { title, detail } = describeItem(item);
  const decide = (state: "accepted" | "rejected") =>
    review.mutate({ id: item.id, state });
  return (
    <li className={`rounded-lg p-3 ${aiOutline(item.review)}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          <AiBadge review={item.review} /> {title}
        </p>
        <ProvenancePopover
          provenance={provenanceOf(run, item)}
          timeZone={timeZone}
        />
      </div>
      {detail ? <p className="mt-1 text-muted-foreground">{detail}</p> : null}
      {editing ? (
        <EditCount
          item={item}
          onCancel={() => setEditing(false)}
          onSave={(data) =>
            review.mutate(
              { id: item.id, state: "edited", data },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : (
        <ReviewBar
          item={item}
          busy={review.isPending}
          onAccept={() => decide("accepted")}
          onReject={() => decide("rejected")}
          {...(countOf(item) !== null
            ? { onEdit: () => setEditing(true) }
            : {})}
        />
      )}
      {item.kind === "lesson-count" &&
      (item.review === "accepted" || item.review === "edited") ? (
        <p className="mt-2 text-muted-foreground">{RECORDED}</p>
      ) : null}
      {review.error ? (
        <p role="alert" className="mt-2 text-danger">
          {review.error.message}
        </p>
      ) : null}
    </li>
  );
}

function RunList({
  runs,
  items,
  timeZone,
}: {
  runs: AiRunView[];
  items: AiItemView[];
  timeZone: string;
}) {
  return (
    <ul aria-label="AI runs" className="space-y-4">
      {runs.map((run) => {
        const mine = items.filter((i) => i.runId === run.id);
        return (
          <li
            key={run.id}
            aria-label={run.skillId}
            className="rounded-lg border border-border p-3"
          >
            <p className="font-semibold break-all">{run.skillId}</p>
            <p className="text-muted-foreground">
              {OUTCOME[run.status]}
              {run.provider ? ` · ${run.provider}` : ""} ·{" "}
              {whenOf(run.startedAt, timeZone)}
              {run.durationMs === null
                ? ""
                : ` · ${(run.durationMs / 1000).toFixed(1)} s`}
            </p>
            {run.failure ? <p className="mt-1">{run.failure}</p> : null}
            {mine.length > 0 ? (
              <ul aria-label="Suggestions" className="mt-2 space-y-2">
                {mine.map((item) => (
                  <Suggestion
                    key={item.id}
                    run={run}
                    item={item}
                    timeZone={timeZone}
                  />
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The header's AI activity: every run with its outcome, and the suggestions waiting for her. */
export function ActivityDrawer() {
  const runs = useAiRuns();
  const items = useAiItems();
  const config = useConfig();
  const waiting = (items.data ?? []).filter((i) => i.review === "suggested");
  const label = waiting.length
    ? `AI activity (${waiting.length} to review)`
    : "AI activity";
  const failed = runs.error ?? items.error;
  return (
    <Disclosure label="AI activity" buttonLabel={label} side>
      {failed ? (
        <ErrorState
          title="The AI activity could not be loaded"
          message={failed.message}
        />
      ) : !runs.data || !items.data ? (
        <Loading what="AI activity" />
      ) : runs.data.length === 0 ? (
        <EmptyState title="No AI runs yet">
          When the AI suggests something it is listed here, marked with a
          sparkle, until you accept, edit or reject it.
        </EmptyState>
      ) : (
        <RunList
          runs={runs.data}
          items={items.data}
          timeZone={config.data?.timeZone ?? "UTC"}
        />
      )}
    </Disclosure>
  );
}
