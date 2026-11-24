import { useState } from "react";
import {
  type Disruption,
  useAllSlots,
  useDisruptions,
  useRemoveDisruptionBatch,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { longDate } from "../../lib/dates.ts";

interface Batch {
  batchId: string;
  reason: string;
  from: string;
  to: string;
  who: string;
  periods: string;
  ids: string[];
}

function who(rows: Disruption[]): string {
  const [first] = rows;
  if (!first) return "";
  switch (first.scope.kind) {
    case "school":
      return "The whole school";
    case "year":
      return `Year ${first.scope.yearGroup}`;
    case "teacher":
      return "You";
    case "group":
      return rows
        .map((r) => (r.scope.kind === "group" ? r.scope.groupId : ""))
        .sort()
        .join(", ");
  }
}

/** One batch per cancellation she made, in the order of their first day. */
function batchesOf(rows: Disruption[]): Batch[] {
  const byBatch = new Map<string, Disruption[]>();
  for (const r of rows)
    byBatch.set(r.batchId, [...(byBatch.get(r.batchId) ?? []), r]);
  return [...byBatch].flatMap(([batchId, group]) => {
    const [first] = group;
    if (!first) return [];
    return [
      {
        batchId,
        reason: first.reason,
        from: first.from,
        to: first.to,
        who: who(group),
        periods: first.periods
          ? `period${first.periods.length === 1 ? "" : "s"} ${first.periods.join(", ")}`
          : "all day",
        ids: group.map((g) => g.id),
      },
    ];
  });
}

export function DisruptionsCard() {
  const disruptions = useDisruptions();
  const slots = useAllSlots();
  const remove = useRemoveDisruptionBatch();
  const [removed, setRemoved] = useState<string | null>(null);
  const batches = batchesOf(
    (disruptions.data ?? []).filter((d) => d.source === "teacher"),
  );
  /** A lesson cancelled by two cancellations counts in each, so the sum can exceed the audit's. */
  const lessonsIn = (b: Batch) =>
    (slots.data ?? []).filter((s) =>
      s.reasons.some((r) => b.ids.includes(r.disruptionId)),
    ).length;

  return (
    <section
      aria-labelledby="disruptions-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="disruptions-title" className="text-xl font-semibold">
        Lessons you cancelled
      </h2>
      {disruptions.isPending ? <Loading what="your cancellations" /> : null}
      {disruptions.isError ? (
        <ErrorState message={disruptions.error.message} />
      ) : null}
      {disruptions.data && batches.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing cancelled">
            Use "Lessons were cancelled" on Today to record one.
          </EmptyState>
        </div>
      ) : null}
      {batches.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {batches.map((b) => {
            const count = lessonsIn(b);
            return (
              <li
                key={b.batchId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <p className="font-medium">{b.reason}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.from === b.to
                      ? longDate(b.from)
                      : `${longDate(b.from)} to ${longDate(b.to)}`}
                    {", "}
                    {b.who}, {b.periods}
                    {slots.data
                      ? `, ${count === 1 ? "1 lesson" : `${count} lessons`}`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label={`Remove ${b.reason}`}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(b.batchId, {
                      onSuccess: () => setRemoved(b.reason),
                    })
                  }
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {remove.isError ? (
        <div className="mt-3">
          <ErrorState
            title="It was not removed"
            message={remove.error.message}
          />
        </div>
      ) : null}
      {removed !== null && !remove.isError ? (
        <p role="status" className="mt-3">
          Removed "{removed}". Its lessons are back.
        </p>
      ) : null}
    </section>
  );
}
