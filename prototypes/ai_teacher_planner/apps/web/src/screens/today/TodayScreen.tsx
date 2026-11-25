import { addDays, type Fortnight } from "@planner/domain";
import { Fragment, useRef, useState } from "react";
import { Link } from "react-router";
import {
  type TodayData,
  useDayText,
  useEvents,
  useFortnights,
  useLastDaysBeforeBreaks,
  useLessonNoteSummary,
  useRemovedLessonNotes,
  useTimetable,
  useToday,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import { LessonNotes } from "../../components/LessonNotes.tsx";
import { PlanArea } from "../../components/PlanNotices.tsx";
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

/** A slot key has spaces and a bar in it; an id for aria-controls cannot. */
const notesId = (slotKey: string) =>
  `notes-${slotKey.replace(/[^A-Za-z0-9]/g, "-")}`;

const filesWords = (n: number) => (n === 1 ? "1 file" : `${n} files`);

/**
 * The toggle for a lesson's plan and files, and what is already there ("note,
 * 2 files"). A spare lesson has no toggle: its id changes on every re-plan.
 */
function NotesToggle({
  groupId,
  period,
  count,
  open,
  controls,
  onToggle,
}: {
  groupId: string;
  period: number;
  count: { hasNote: boolean; materials: number } | undefined;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const has = [
    count?.hasNote ? "plan" : null,
    count?.materials ? filesWords(count.materials) : null,
  ].filter(Boolean);
  return (
    <Button
      type="button"
      className="ml-2"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      aria-label={`Plan and materials for ${groupId}, period ${period}${has.length ? ` (${has.join(", ")})` : ""}`}
      onClick={onToggle}
    >
      Plan and materials{has.length ? ` (${has.join(", ")})` : ""}
    </Button>
  );
}

/** Notes and files for lessons taken out of the scheme: kept, and listed here so they are not lost. */
function RemovedNotes() {
  const removed = useRemovedLessonNotes();
  const items = removed.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="removed-notes-title" className="mt-8">
      <h2 id="removed-notes-title" className="mb-2 text-lg font-semibold">
        Notes for lessons no longer in the plan
      </h2>
      <ul className="space-y-4">
        {items.map((n) => (
          <li
            key={`${n.groupId}/${n.lessonId}`}
            className="rounded-lg border border-border p-3"
          >
            <h3 className="font-semibold">
              {n.groupId}: {n.title}
            </h3>
            <LessonNotes groupId={n.groupId} lessonId={n.lessonId} />
          </li>
        ))}
      </ul>
    </section>
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
  const summary = useLessonNoteSummary();
  const counts = new Map(
    (summary.data?.items ?? []).map((i) => [
      `${i.groupId}\u0000${i.lessonId}`,
      i,
    ]),
  );
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpened((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
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
            <th scope="col" className="py-2 pr-4">
              Room
            </th>
            <th scope="col" className="py-2">
              Lesson
            </th>
          </tr>
        </thead>
        <tbody>
          {today.lessons.map(({ slot, start, end, lesson, assessment }) => (
            <Fragment key={slot.key}>
              <tr className="border-b border-border">
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
                <td className="py-2 pr-4">
                  {slot.room ? `Room ${slot.room}` : "No room set"}
                </td>
                <td className="py-2">
                  {lesson ? (
                    <>
                      {lesson.title}
                      {assessment ? (
                        <span className="ml-2 rounded-full border border-border px-1.5 text-sm">
                          with {assessment.title}
                        </span>
                      ) : null}
                      {slot.status === "cancelled" ? (
                        <span className="ml-2 text-sm text-muted-foreground">
                          not moved until you accept a new plan
                        </span>
                      ) : null}
                      {lesson.kind === "flex" ? null : (
                        <NotesToggle
                          groupId={slot.groupId}
                          period={slot.period}
                          count={counts.get(
                            `${slot.groupId}\u0000${lesson.lessonId}`,
                          )}
                          open={opened.has(slot.key)}
                          controls={notesId(slot.key)}
                          onToggle={() => toggle(slot.key)}
                        />
                      )}
                    </>
                  ) : assessment ? (
                    // a whole-slot assessment fills the lesson, as on the board
                    `${assessment.title} (assessment, whole lesson)`
                  ) : (
                    <span className="text-muted-foreground">
                      No lesson planned
                    </span>
                  )}
                </td>
              </tr>
              {lesson && lesson.kind !== "flex" && opened.has(slot.key) ? (
                <tr id={notesId(slot.key)} className="border-b border-border">
                  <td colSpan={5} className="py-3">
                    <LessonNotes
                      groupId={slot.groupId}
                      lessonId={lesson.lessonId}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
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
      <div className="mt-4">
        <PlanArea />
      </div>
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
          <RemovedNotes />
        </div>
        <TodoNotes today={data.date} />
      </div>
    </section>
  );
}
