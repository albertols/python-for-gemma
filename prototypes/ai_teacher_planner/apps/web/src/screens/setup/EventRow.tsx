import {
  disruptionsFromEvents,
  type EventCandidate,
  type EventClassification,
  keptDates,
  lessonsHitBy,
  type Period,
  type Slot,
  type YearGroup,
} from "@planner/domain";
import { useEffect, useId, useRef, useState } from "react";
import {
  type EventItem,
  useRemoveClassification,
  useSaveClassification,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { longDate, shortDate } from "../../lib/dates.ts";

export interface GroupInfo {
  id: string;
  yearGroup: number;
  colour: string;
}

const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];
const field = "rounded-md border border-border bg-card px-2 py-1";
const toggle = <T,>(list: T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

const asCandidate = (e: EventItem): EventCandidate => ({
  wordingKey: e.wordingKey,
  text: e.text,
  column: e.column,
  yearGroup: e.yearGroup as YearGroup | null,
  dates: e.dates,
  presort: e.presort,
});

/** What a confirmation does, in her words. */
export function describe(k: EventClassification, e: EventItem): string {
  const dates =
    k.onlyDates === null
      ? e.dates.length === 1
        ? ""
        : "every date"
      : k.onlyDates.map(shortDate).join(", ");
  if (k.decision === "no-effect")
    return `Does not affect your lessons${dates ? ` (${dates})` : ""}`;
  const who =
    k.groupIds !== null
      ? k.groupIds.join(", ")
      : e.yearGroup === null
        ? "all your groups"
        : `Year ${e.yearGroup}`;
  const when =
    k.periods === null ? "all day" : `period ${k.periods.join(", ")}`;
  const until = k.until === null ? "" : `, lasting until ${longDate(k.until)}`;
  return `Cancels ${who}, ${dates || shortDate(e.dates[0] ?? "")}, ${when}${until}`;
}

function DetailsForm({
  event,
  groups,
  allSlots,
  editing,
  freeDates,
  onClose,
  onSaved,
}: {
  event: EventItem;
  groups: GroupInfo[];
  allSlots: Slot[];
  editing: EventClassification | null;
  freeDates: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ids = useId();
  const save = useSaveClassification();
  const forGroups = groups.filter(
    (g) => event.yearGroup === null || g.yearGroup === event.yearGroup,
  );
  const [chosenGroups, setChosenGroups] = useState<string[]>(
    editing?.decision === "cancels" && editing.groupIds
      ? editing.groupIds
      : forGroups.map((g) => g.id),
  );
  const [chosenDates, setChosenDates] = useState<string[]>(
    editing?.decision === "cancels" && editing.onlyDates
      ? editing.onlyDates
      : freeDates,
  );
  const [until, setUntil] = useState(
    editing?.decision === "cancels" ? (editing.until ?? "") : "",
  );
  const [allDay, setAllDay] = useState(
    !(editing?.decision === "cancels" && editing.periods),
  );
  const [periods, setPeriods] = useState<Period[]>(
    editing?.decision === "cancels" ? (editing.periods ?? []) : [],
  );

  const everyGroup = chosenGroups.length === forGroups.length;
  const everyDate = chosenDates.length === event.dates.length;
  const draft: EventClassification = {
    id: editing?.id ?? "draft",
    wordingKey: event.wordingKey,
    yearGroup: event.yearGroup as YearGroup | null,
    onlyDates: everyDate ? null : [...chosenDates].sort(),
    decision: "cancels",
    groupIds: everyGroup ? null : [...chosenGroups].sort(),
    periods: allDay ? null : [...periods].sort((a, b) => a - b),
    until: until === "" ? null : until,
    provenance: "teacher",
  };
  const candidate = asCandidate(event);
  const last = [...keptDates(candidate, draft)].sort().at(-1);
  const backwards =
    draft.until !== null && last !== undefined && draft.until < last;
  const ready =
    chosenGroups.length > 0 &&
    chosenDates.length > 0 &&
    (allDay || periods.length > 0) &&
    !backwards;
  const lessons = ready
    ? lessonsHitBy(
        disruptionsFromEvents([candidate], [draft], groups as never),
        allSlots,
        groups as never,
      ).length
    : 0;
  // The chosen groups matter only when they are not the usual ones.
  const submit = () => {
    const { id: _ignored, provenance: _p, ...body } = draft;
    save.mutate(
      { id: editing?.id ?? crypto.randomUUID(), ...body },
      { onSuccess: onSaved },
    );
  };
  const heading = useRef<HTMLHeadingElement>(null);

  return (
    <form
      aria-labelledby={`${ids}-title`}
      className="mt-3 space-y-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <h4
        id={`${ids}-title`}
        ref={heading}
        tabIndex={-1}
        className="font-semibold"
      >
        What "{event.text}" does to your lessons
      </h4>
      <fieldset>
        <legend className="font-medium">Which of your groups</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {forGroups.map((g) => (
            <label key={g.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosenGroups.includes(g.id)}
                onChange={() => {
                  save.reset();
                  setChosenGroups(toggle(chosenGroups, g.id));
                }}
              />
              <GroupBadge id={g.id} colour={g.colour} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-medium">Which dates</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {event.dates.map((d) => {
            const taken = !freeDates.includes(d) && !chosenDates.includes(d);
            return (
              <label key={d} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosenDates.includes(d)}
                  disabled={taken}
                  onChange={() => {
                    save.reset();
                    setChosenDates(toggle(chosenDates, d));
                  }}
                />
                {longDate(d)}
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="flex flex-wrap items-center gap-2">
        Lasts until (optional, for study leave)
        <input
          type="date"
          className={field}
          value={until}
          onChange={(e) => {
            save.reset();
            setUntil(e.target.value);
          }}
        />
      </label>
      {backwards ? (
        <p className="text-danger">
          The last day is before {last ? longDate(last) : "the first date"}.
        </p>
      ) : null}
      <fieldset>
        <legend className="font-medium">Which periods</legend>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${ids}-periods`}
              checked={allDay}
              onChange={() => setAllDay(true)}
            />
            All day
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${ids}-periods`}
              checked={!allDay}
              onChange={() => setAllDay(false)}
            />
            Chosen periods
          </label>
        </div>
        {allDay ? null : (
          <div className="mt-2 flex flex-wrap gap-4">
            {PERIODS.map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={periods.includes(p)}
                  onChange={() => setPeriods(toggle(periods, p))}
                />
                Period {p}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <p aria-live="polite" data-testid="event-lesson-count">
        {ready
          ? lessons === 1
            ? "1 lesson would be cancelled"
            : `${lessons} lessons would be cancelled`
          : "Choose groups, dates and periods to see the lessons."}
      </p>
      {save.isError ? (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={!ready || lessons === 0 || save.isPending}
        >
          Confirm
        </Button>
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </div>
    </form>
  );
}

export function EventRow({
  event,
  groups,
  allSlots,
}: {
  event: EventItem;
  groups: GroupInfo[];
  allSlots: Slot[];
}) {
  const [form, setForm] = useState<{
    editing: EventClassification | null;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useSaveClassification();
  const undo = useRemoveClassification();
  const status = useRef<HTMLParagraphElement>(null);
  // Move focus to the message, so the keyboard and a screen reader land on what happened.
  useEffect(() => {
    if (notice !== null) status.current?.focus();
  }, [notice]);
  const candidate = asCandidate(event);
  const classifications = event.classifications as EventClassification[];
  const covered = new Set(
    classifications.flatMap((k) => keptDates(candidate, k)),
  );
  const freeDates = event.dates.filter((d) => !covered.has(d));
  const who =
    event.yearGroup === null ? "Whole school" : `Year ${event.yearGroup}`;
  const error = save.error ?? undo.error;

  return (
    <li
      data-event={`${event.yearGroup ?? "school"}|${event.wordingKey}`}
      className="rounded-md border border-border p-3"
    >
      <p className="font-medium">{event.text}</p>
      <p className="text-sm text-muted-foreground">
        {who}, {event.dates.map(shortDate).join(", ")},{" "}
        {event.lessons === 1
          ? "1 of your lessons"
          : `${event.lessons} of your lessons`}
      </p>
      {classifications.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {classifications.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center gap-3"
              data-decision={k.decision}
            >
              <span>{describe(k, event)}</span>
              <Button
                type="button"
                aria-label={`Change what ${event.text} does`}
                onClick={() => setForm({ editing: k })}
              >
                Change
              </Button>
              <Button
                type="button"
                aria-label={`Undo ${event.text}${k.onlyDates ? ` (${k.onlyDates.map(shortDate).join(", ")})` : ""}`}
                disabled={undo.isPending}
                onClick={() =>
                  undo.mutate(k.id, {
                    onSuccess: () => {
                      setNotice(
                        `Undone: "${event.text}". Its lessons are back.`,
                      );
                    },
                  })
                }
              >
                Undo
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {freeDates.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-3">
          <Button
            type="button"
            aria-label={`${event.text}: cancels my lessons`}
            onClick={() => setForm({ editing: null })}
          >
            Cancels my lessons
          </Button>
          <Button
            type="button"
            aria-label={`${event.text}: does not affect my lessons`}
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: crypto.randomUUID(),
                  wordingKey: event.wordingKey,
                  yearGroup: event.yearGroup as YearGroup | null,
                  onlyDates: covered.size === 0 ? null : freeDates,
                  decision: "no-effect",
                  groupIds: null,
                  periods: null,
                  until: null,
                },
                {
                  onSuccess: () => {
                    setNotice(
                      `Saved: "${event.text}" does not affect your lessons.`,
                    );
                  },
                },
              )
            }
          >
            Does not affect my lessons
          </Button>
        </div>
      ) : null}
      {form ? (
        <DetailsForm
          key={form.editing?.id ?? "new"}
          event={event}
          groups={groups}
          allSlots={allSlots}
          editing={form.editing}
          freeDates={
            form.editing
              ? [...freeDates, ...keptDates(candidate, form.editing)]
              : freeDates
          }
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            setNotice(`Saved: "${event.text}".`);
          }}
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error.message}
        </p>
      ) : null}
      {notice !== null ? (
        <p
          ref={status}
          tabIndex={-1}
          role="status"
          className="mt-2 text-sm outline-none"
        >
          {notice}
        </p>
      ) : null}
    </li>
  );
}
