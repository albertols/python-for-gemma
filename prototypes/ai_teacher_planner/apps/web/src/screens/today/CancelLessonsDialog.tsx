import { useEffect, useId, useRef, useState } from "react";
import {
  type DisruptionBody,
  useCreateDisruption,
  useDisruptionPreview,
  useTimetable,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { fullDayWithYear } from "../../lib/dates.ts";

const PERIODS = [1, 2, 3, 4, 5, 6] as const;
type Who = "school" | "year" | "groups";
const field = "rounded-md border border-border bg-card px-2 py-1";
const NO_LESSONS = "No lessons fall in these dates";
const MAX_REASON = 200;

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function CancelForm({
  today,
  onClose,
  onDone,
}: {
  today: string;
  onClose: () => void;
  onDone: (lessons: number) => void;
}) {
  const timetable = useTimetable();
  const groups = timetable.data?.groups ?? [];
  const years = [...new Set(groups.map((g) => g.yearGroup))].sort(
    (a, b) => a - b,
  );
  const [who, setWho] = useState<Who>("school");
  const [year, setYear] = useState<number | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [periods, setPeriods] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const create = useCreateDisruption();
  const ids = useId();

  const chosenYear = year ?? years[0] ?? null;
  const backwards = to < from;
  const ready =
    from !== "" &&
    to !== "" &&
    !backwards &&
    (allDay || periods.length > 0) &&
    (who !== "groups" || groupIds.length > 0) &&
    (who !== "year" || chosenYear !== null);
  const body = (withReason: string): DisruptionBody => ({
    scope: who,
    ...(who === "year" && chosenYear !== null
      ? { yearGroup: chosenYear as 7 }
      : {}),
    ...(who === "groups" ? { groupIds } : {}),
    from,
    to,
    periods: allDay
      ? null
      : (periods.slice().sort() as DisruptionBody["periods"]),
    reason: withReason,
  });
  // The reason is left out so the list does not reload on every key she types.
  const preview = useDisruptionPreview(ready ? body("") : null);
  const hits = preview.data;
  const reasonMissing = reason.trim() === "";

  const submit = () => {
    create.mutate(body(reason), {
      onSuccess: (rows) => {
        // One lesson can sit in several rows; the preview already counted it once.
        onDone(hits?.length ?? rows.length);
      },
    });
  };
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      create.reset();
      set(v);
    };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!reasonMissing) submit();
      }}
      className="space-y-4"
    >
      <fieldset>
        <legend className="font-semibold">Who</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {(
            [
              ["school", "The whole school"],
              ["year", "A year"],
              ["groups", "Chosen groups"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${ids}-who`}
                checked={who === value}
                onChange={() => change(setWho)(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {who === "year" ? (
          <label className="mt-2 flex items-center gap-2">
            Year
            <select
              className={field}
              value={chosenYear ?? ""}
              onChange={(e) => change(setYear)(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {who === "groups" ? (
          <div className="mt-2 flex flex-wrap gap-4">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={groupIds.includes(g.id)}
                  onChange={() => change(setGroupIds)(toggle(groupIds, g.id))}
                />
                <GroupBadge id={g.id} colour={g.colour} />
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="font-semibold">When</legend>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            From
            <input
              type="date"
              className={field}
              value={from}
              onChange={(e) => change(setFrom)(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2">
            To
            <input
              type="date"
              className={field}
              value={to}
              onChange={(e) => change(setTo)(e.target.value)}
            />
          </label>
        </div>
        {backwards ? (
          <p className="mt-1 text-danger">
            The last day is before the first day.
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${ids}-periods`}
              checked={allDay}
              onChange={() => change(setAllDay)(true)}
            />
            All day
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${ids}-periods`}
              checked={!allDay}
              onChange={() => change(setAllDay)(false)}
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
                  onChange={() => change(setPeriods)(toggle(periods, p))}
                />
                Period {p}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${ids}-reason`} className="font-semibold">
          Reason
        </label>
        <input
          id={`${ids}-reason`}
          type="text"
          className={`${field} mt-1 block w-full`}
          maxLength={MAX_REASON}
          aria-describedby={`${ids}-hint`}
          placeholder="For example, School photos"
          value={reason}
          onChange={(e) => change(setReason)(e.target.value)}
        />
        <p id={`${ids}-hint`} className="mt-1 text-sm text-muted-foreground">
          No student names
        </p>
      </div>

      <div>
        <h3 className="font-semibold">Lessons that would be cancelled</h3>
        {!ready ? (
          <p className="mt-1 text-muted-foreground">
            Choose who, when and which periods to see the lessons.
          </p>
        ) : preview.isError ? (
          <p className="mt-1 text-danger">{preview.error.message}</p>
        ) : !hits ? (
          <p className="mt-1 text-muted-foreground">Looking for lessons...</p>
        ) : hits.length === 0 ? (
          <p className="mt-1">{NO_LESSONS}</p>
        ) : (
          <>
            <p className="mt-1">
              {hits.length === 1 ? "1 lesson" : `${hits.length} lessons`}
            </p>
            {/* tabIndex: a long list scrolls, and the keyboard must be able to reach it. */}
            <ul
              className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-sm"
              aria-label="The lessons"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be focusable
              tabIndex={0}
            >
              {hits.map((h) => (
                <li key={`${h.groupId}|${h.date}|${h.period}`}>
                  {h.groupId}, period {h.period}, {fullDayWithYear(h.date)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {create.isError ? (
        <p role="alert" className="text-danger">
          {create.error.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={!ready || reasonMissing || create.isPending}
        >
          Cancel these lessons
        </Button>
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </div>
    </form>
  );
}

/**
 * An in-page dialog (the browser's own <dialog>, so Tab stays inside it, Escape
 * closes it and focus goes back to the button that opened it).
 */
export function CancelLessonsDialog({
  open,
  today,
  onClose,
  onDone,
}: {
  open: boolean;
  today: string;
  onClose: () => void;
  onDone: (lessons: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-6 text-card-foreground backdrop:bg-black/50"
    >
      <h2 id={titleId} className="mb-4 text-xl font-semibold">
        Lessons were cancelled
      </h2>
      {open ? (
        <CancelForm today={today} onClose={onClose} onDone={onDone} />
      ) : null}
    </dialog>
  );
}
