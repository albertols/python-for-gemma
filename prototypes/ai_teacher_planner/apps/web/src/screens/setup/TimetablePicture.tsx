import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../api/client.ts";
import { useAiItems, useJob, useReviewItem } from "../../api/jobs.ts";
import {
  refreshAfterTimetableChange,
  type TimetableVersionData,
  useUploadTimetablePicture,
} from "../../api/queries.ts";
import { AiBadge, aiOutline } from "../../components/AiBadge.tsx";
import { ReviewBar } from "../../components/ReviewBar.tsx";
import { SuggestedGrid } from "./SuggestedGrid.tsx";
import { cellName, gridOf } from "./timetable-suggestion.ts";

/**
 * Upload a picture of her timetable; Claude suggests a grid; it is shown beside hers with the
 * changed cells marked. Nothing changes until she accepts, and she can reject it.
 */
export function TimetablePicture({
  version,
  onApplied,
}: {
  version: TimetableVersionData;
  /** The stored grid was replaced and fetched again: the editor starts from it. */
  onApplied: () => void;
}) {
  const qc = useQueryClient();
  const upload = useUploadTimetablePicture(version.id);
  const [runId, setRunId] = useState<string | null>(null);
  const job = useJob(runId);
  const items = useAiItems();
  const review = useReviewItem();
  const waiting = (items.data ?? []).filter(
    (i) =>
      i.kind === "timetable-grid" &&
      i.review === "suggested" &&
      i.target === version.id,
  );
  const asking = upload.isPending || (runId !== null && !job.ended);
  const run = job.run;
  const said =
    run?.failure ??
    (run?.status === "done" && run.itemIds.length === 0 ? run.note : null);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            Suggest a grid from a picture of your timetable
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={asking}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                upload.mutate(file, { onSuccess: (r) => setRunId(r.id) });
            }}
          />
        </label>
        <span className="text-sm text-muted-foreground">
          PNG or JPG, up to 10 MB. Claude only reads it; nothing changes until
          you accept.
        </span>
      </div>
      {asking || said ? (
        <div role="status">
          {asking ? (
            <p>Reading your picture{job.note ? `: ${job.note}` : "..."}</p>
          ) : (
            <p className={run?.failure ? "text-danger" : undefined}>{said}</p>
          )}
        </div>
      ) : null}
      {upload.error ? (
        <p role="alert" className="font-medium text-danger">
          {upload.error.message}
        </p>
      ) : null}
      {waiting.map((item) => {
        const grid = gridOf(item);
        if (!grid) return null;
        return (
          <section
            key={item.id}
            aria-label="Suggested timetable"
            className={`space-y-3 rounded-lg p-3 ${aiOutline(item.review)}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <AiBadge review={item.review} />
              <h3 className="font-semibold">
                Claude's reading of your picture, beside your timetable
              </h3>
            </div>
            <SuggestedGrid current={version} suggestion={grid} />
            {grid.unsure.length > 0 ? (
              <div>
                <h4 className="font-semibold">
                  Cells Claude could not read (left empty above)
                </h4>
                <ul className="list-disc pl-5">
                  {grid.unsure.map((u) => (
                    <li key={`${u.week}-${u.weekday}-${u.period}`}>
                      {cellName(u)}: {u.note}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ReviewBar
              item={item}
              busy={review.isPending}
              onAccept={() =>
                review.mutate(
                  { id: item.id, state: "accepted" },
                  {
                    onSuccess: async () => {
                      await refreshAfterTimetableChange(qc);
                      onApplied();
                    },
                  },
                )
              }
              onReject={() => review.mutate({ id: item.id, state: "rejected" })}
            />
            {review.isError ? (
              <div role="alert" className="text-danger">
                <p className="font-medium">{review.error.message}</p>
                {review.error instanceof ApiError &&
                review.error.issues.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {review.error.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
