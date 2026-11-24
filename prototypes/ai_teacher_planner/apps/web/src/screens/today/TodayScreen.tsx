import { addDays, type Fortnight } from "@planner/domain";
import { useRef, useState } from "react";
import { Link } from "react-router";
import {
  type TodayData,
  useDayText,
  useEvents,
  useFortnights,
  useLastDaysBeforeBreaks,
  useTimetable,
  useToday,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { fullDayWithYear } from "../../lib/dates.ts";
import { possibleOf } from "../../lib/possible.ts";
import { CancelLessonsDialog } from "./CancelLessonsDialog.tsx";
import { RemindersList } from "./RemindersList.tsx";
import { TodoNotes } from "./TodoNotes.tsx";
import { whyNoLessons } from "./why-no-lessons.ts";

const startOf = (f: Fortnight) => f.w1 ?? f.w2 ?? "";

/** The board link for the fortnight holding a date; plain /board if it cannot be found. */
function boardLink(fortnights: Fortnight[] | undefined, date: string): string {
  const found = fortnights?.find(
    (f) => startOf(f) <= date && date <= addDays(f.w2 ?? f.w1 ?? "", 6),
  );
  return found ? `/board?w1=${startOf(found)}` : "/board";
}

function NextTeachingDay({ date }: { date: string }) {
  const fortnights = useFortnights();
  return (
    <p className="mt-2">
      Next teaching day:{" "}
      <Link
        className="underline underline-offset-2"
        to={boardLink(fortnights.data, date)}
      >
        {fullDayWithYear(date)}
      </Link>
    </p>
  );
}

function Lessons({ today }: { today: TodayData }) {
  const timetable = useTimetable();
  const events = useEvents();
  const possible = possibleOf(events.data, timetable.data?.groups);
  const colours = new Map(
    (timetable.data?.groups ?? []).map((g) => [g.id, g.colour] as const),
  );
  const text = useDayText(today.lessons.length === 0 ? today.date : null);
  if (today.lessons.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border p-6">
        <h2 className="text-lg font-semibold">No lessons today</h2>
        <p className="mt-1 text-muted-foreground">
          {text.isPending ? "" : whyNoLessons(today, text.data ?? null)}
        </p>
        {today.nextTeachingDay ? (
          <NextTeachingDay date={today.nextTeachingDay} />
        ) : (
          <p className="mt-2 text-muted-foreground">
            There is no later teaching day in the calendar.
          </p>
        )}
      </div>
    );
  const allCancelled = today.lessons.every(
    (l) => l.slot.status === "cancelled",
  );
  return (
    <>
      {allCancelled ? (
        <p className="mb-2">{whyNoLessons(today, null)}</p>
      ) : null}
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Today's lessons in period order</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-4">
              Period
            </th>
            <th scope="col" className="py-2 pr-4">
              Time
            </th>
            <th scope="col" className="py-2 pr-4">
              Group
            </th>
            <th scope="col" className="py-2">
              Room
            </th>
          </tr>
        </thead>
        <tbody>
          {today.lessons.map(({ slot, start, end }) => (
            <tr key={slot.key} className="border-b border-border">
              <th scope="row" className="py-2 pr-4 font-medium">
                {slot.period}
              </th>
              <td className="py-2 pr-4">
                {start} to {end}
              </td>
              <td className="py-2 pr-4">
                <GroupBadge
                  id={slot.groupId}
                  colour={colours.get(slot.groupId)}
                />
                {slot.status === "open" ? null : (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {slot.status}
                    {slot.reasons.length
                      ? `: ${slot.reasons.map((r) => r.text).join(", ")}`
                      : ""}
                  </span>
                )}
                {possible(slot).map((t) => (
                  <span
                    key={t}
                    className="ml-2 text-sm italic text-muted-foreground"
                  >
                    Possible disruption: {t}
                  </span>
                ))}
              </td>
              <td className="py-2">
                {slot.room ? `Room ${slot.room}` : "No room set"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The button that opens the cancel dialog, and the sentence that says what it did. */
function CancelLessons({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button
        ref={button}
        type="button"
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
      >
        Lessons were cancelled
      </Button>
      {done ? <span role="status">{done}</span> : null}
      <CancelLessonsDialog
        open={open}
        today={today}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
        onDone={(n) => {
          setDone(`${n === 1 ? "1 lesson" : `${n} lessons`} cancelled.`);
          setOpen(false);
          button.current?.focus();
        }}
      />
    </div>
  );
}

export function TodayScreen() {
  const today = useToday();
  const lastDays = useLastDaysBeforeBreaks();
  if (today.isPending) return <Loading what="today" />;
  if (today.isError) return <ErrorState message={today.error.message} />;
  const data = today.data;

  if (data.kind === "no-calendar")
    return (
      <section aria-labelledby="today-title">
        <h1 id="today-title" className="text-2xl font-semibold">
          {fullDayWithYear(data.date)}
        </h1>
        <div className="mt-6">
          <EmptyState title="The planner has no school calendar yet">
            Import it once and Today, the board and the slot audit fill in.
          </EmptyState>
          <Link
            to="/setup"
            className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Import the school calendar
          </Link>
        </div>
      </section>
    );

  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title" className="text-2xl font-semibold">
        {fullDayWithYear(data.date)}
      </h1>
      {lastDays.data?.has(data.date) ? (
        <p className="mt-1">Last day before the holiday</p>
      ) : null}
      {lastDays.isError ? (
        <p className="mt-1 text-sm text-muted-foreground">
          The last days before holidays could not be loaded.
        </p>
      ) : null}
      {data.weekLabel ? (
        <p className="mt-1 text-lg">Week {data.weekLabel.slice(1)}</p>
      ) : null}
      <CancelLessons today={data.date} />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div>
            <h2 className="mb-2 text-lg font-semibold">Lessons</h2>
            <Lessons today={data} />
          </div>
          <div className="mt-8">
            <h2 className="mb-2 text-lg font-semibold">Coming up</h2>
            <RemindersList reminders={data.reminders} />
          </div>
        </div>
        <TodoNotes today={data.date} />
      </div>
    </section>
  );
}
