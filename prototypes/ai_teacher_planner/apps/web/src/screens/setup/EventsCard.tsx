import {
  useAllSlots,
  useEvents,
  useRemoveClassification,
  useStaleEvents,
  useTimetable,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { shortDate } from "../../lib/dates.ts";
import { EventRow } from "./EventRow.tsx";

const LISTS = [
  { id: "cancels", title: "Suggested: cancels lessons" },
  { id: "unsure", title: "Not sure" },
  { id: "no-effect", title: "Suggested: no effect" },
] as const;

/** Calendar events cancel lessons only once she confirms them here. The sort is a suggestion, nothing more. */
export function EventsCard() {
  const events = useEvents();
  const stale = useStaleEvents();
  const timetable = useTimetable();
  const slots = useAllSlots();
  const undo = useRemoveClassification();
  const groups = timetable.data?.groups ?? [];

  return (
    <section
      aria-labelledby="events-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="events-title" className="text-xl font-semibold">
        Calendar events that may affect your lessons
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing here cancels a lesson until you confirm it. The lists are only
        suggestions.
      </p>
      {events.isPending || !slots.data ? <Loading what="the events" /> : null}
      {events.isError ? <ErrorState message={events.error.message} /> : null}
      {events.data && events.data.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No events">
            No event in the calendar falls on a day you teach.
          </EmptyState>
        </div>
      ) : null}
      {events.data && slots.data
        ? LISTS.map((list) => {
            const rows = events.data.filter(
              (e) => e.presort.suggestion === list.id,
            );
            if (rows.length === 0) return null;
            return (
              <section
                key={list.id}
                aria-labelledby={`events-${list.id}`}
                className="mt-4"
              >
                <h3 id={`events-${list.id}`} className="font-semibold">
                  {list.title}
                </h3>
                <ul className="mt-2 space-y-2">
                  {rows.map((e) => (
                    <EventRow
                      key={`${e.yearGroup}|${e.wordingKey}`}
                      event={e}
                      groups={groups}
                      allSlots={slots.data}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        : null}
      {stale.data && stale.data.length > 0 ? (
        <section aria-labelledby="events-stale" className="mt-4">
          <h3 id="events-stale" className="font-semibold text-danger">
            Your confirmations that no longer match the calendar
          </h3>
          <ul className="mt-2 space-y-2">
            {stale.data.map((s) => (
              <li key={s.classification.id}>
                <strong>{s.classification.wordingKey}</strong>
                {s.candidateGone
                  ? ": the calendar no longer has this wording."
                  : `: the calendar no longer has ${s.missingDates.map(shortDate).join(", ")}.`}{" "}
                <Button
                  type="button"
                  aria-label={`Remove your confirmation of ${s.classification.wordingKey}`}
                  disabled={undo.isPending}
                  onClick={() => undo.mutate(s.classification.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
