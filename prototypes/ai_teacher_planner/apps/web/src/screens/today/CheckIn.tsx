import { LOG_NOTE_LIMIT } from "@planner/domain";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client.ts";
import {
  type CheckInBody,
  useCheckIn,
  useRecordCheckIn,
  useTimetable,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import { StatusLine, useAnnounce } from "../../components/PlanNotices.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Loading } from "../../components/ui/states.tsx";
import { fullDay } from "../../lib/dates.ts";
import {
  answerSentence,
  confirmSentence,
  groupsOf,
  lessonLabel,
  moreWeeksSentence,
  NOTHING_TO_CONFIRM,
  OTHER_OUTCOMES,
  type WaitingLesson,
  type WaitingWeek,
  weekHeading,
  weeksToShow,
} from "./check-in-model.ts";

const field = "rounded-md border border-border bg-card px-2 py-1";
/** Writes the answers; true when they were saved, false when the planner refused them. */
type SaveFn = (
  entries: CheckInBody["entries"],
  saved: { sentence: (outOfDate: boolean) => string },
) => Promise<boolean>;
const lessonKey = (l: WaitingLesson) => `${l.groupId}\u0000${l.lessonId}`;

type Outcome = CheckInBody["entries"][number]["outcome"];

/** What did not go as planned for one lesson: cover, skipped or set as homework, and a note. */
function OtherAnswer({
  lesson,
  busy,
  onSave,
  onCancel,
}: {
  lesson: WaitingLesson;
  busy: boolean;
  onSave: (outcome: Outcome, note: string | null) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (outcome) onSave(outcome, note.trim() === "" ? null : note.trim());
  };
  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-md border border-border p-3"
    >
      <fieldset>
        <legend className="font-medium">
          {`What happened to ${lessonLabel(lesson)}?`}
        </legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {OTHER_OUTCOMES.map((o) => (
            <label key={o.value} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-outcome`}
                value={o.value}
                checked={outcome === o.value}
                onChange={() => setOutcome(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
        <label className="mt-2 block">
          Note (optional)
          <input
            type="text"
            className={`${field} mt-1 block w-full max-w-md`}
            maxLength={LOG_NOTE_LIMIT}
            value={note}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">
          A few words for yourself. No student names.
        </p>
      </fieldset>
      <div className="mt-2 flex gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={outcome === null || busy}
        >
          Save answer
        </Button>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * "Did these happen as planned?": one section per week that is waiting (the
 * oldest four), one row per group. One button confirms a group's whole week;
 * a lesson that did not go as planned has its own answer. Nothing is stored
 * here: `onSave` writes the lesson log.
 */
export function CheckInView({
  weeks,
  colours,
  busy,
  error,
  status = null,
  onSave,
}: {
  weeks: readonly WaitingWeek[];
  colours: ReadonlyMap<string, string>;
  busy: boolean;
  /** Why the last save was refused, in the planner's words. */
  error: string | null;
  /** The line that says what was saved; it takes the focus after an answer. */
  status?: ReactNode;
  onSave: SaveFn;
}) {
  const headingId = useId();
  const { shown, hidden } = weeksToShow(weeks);
  const [open, setOpen] = useState<string | null>(null);
  const openers = useRef(new Map<string, HTMLButtonElement>());
  const closeForm = (key: string) => {
    setOpen(null);
    // the button stays on the page, so the keyboard goes back to it
    setTimeout(() => openers.current.get(key)?.focus(), 0);
  };
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        Did these happen as planned?
      </h2>
      {status}
      {error ? (
        <p role="alert" className="mb-2 font-medium text-danger">
          {error}
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p>{NOTHING_TO_CONFIRM}</p>
      ) : (
        <div className="space-y-4">
          {shown.map((week) => (
            <WeekSection
              key={week.weekOf}
              week={week}
              colours={colours}
              busy={busy}
              open={open}
              setOpen={setOpen}
              closeForm={closeForm}
              openers={openers.current}
              onSave={onSave}
            />
          ))}
          {hidden > 0 ? (
            <p className="text-muted-foreground">{moreWeeksSentence(hidden)}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function WeekSection({
  week,
  colours,
  busy,
  open,
  setOpen,
  closeForm,
  openers,
  onSave,
}: {
  week: WaitingWeek;
  colours: ReadonlyMap<string, string>;
  busy: boolean;
  open: string | null;
  setOpen: (key: string | null) => void;
  closeForm: (key: string) => void;
  openers: Map<string, HTMLButtonElement>;
  onSave: SaveFn;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-border p-3"
    >
      <h3 id={id} className="font-semibold">
        {weekHeading(week.weekOf)}
      </h3>
      <ul className="mt-2 space-y-3">
        {groupsOf(week.lessons).map((row) => (
          <li key={row.groupId} className="border-t border-border pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <h4 className="font-medium">
                <GroupBadge
                  id={row.groupId}
                  colour={colours.get(row.groupId)}
                />
              </h4>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() =>
                  onSave(
                    row.lessons.map((l) => ({
                      groupId: l.groupId,
                      lessonId: l.lessonId,
                      outcome: "taught" as const,
                      note: null,
                    })),
                    {
                      sentence: () => confirmSentence(row.groupId, week.weekOf),
                    },
                  )
                }
              >
                Confirm {row.groupId}
                <span className="sr-only">
                  {" "}
                  for the week of {fullDay(week.weekOf)}
                </span>
              </Button>
            </div>
            <ul className="mt-2 space-y-2">
              {row.lessons.map((l) => {
                const key = lessonKey(l);
                return (
                  <li key={key}>
                    <span>{lessonLabel(l)}</span>
                    <Button
                      type="button"
                      className="ml-3"
                      aria-expanded={open === key}
                      aria-label={`Not as planned: ${l.groupId}, ${lessonLabel(l)}`}
                      ref={(el) => {
                        if (el) openers.set(key, el);
                        else openers.delete(key);
                      }}
                      onClick={() => setOpen(open === key ? null : key)}
                    >
                      Not as planned
                    </Button>
                    {open === key ? (
                      <OtherAnswer
                        lesson={l}
                        busy={busy}
                        onCancel={() => closeForm(key)}
                        onSave={(outcome, note) => {
                          // the form stays open, with her note, until the planner has said yes
                          void onSave(
                            [
                              {
                                groupId: l.groupId,
                                lessonId: l.lessonId,
                                outcome,
                                note,
                              },
                            ],
                            {
                              sentence: (outOfDate) =>
                                answerSentence(l, outcome, outOfDate),
                            },
                          ).then((saved) => {
                            if (saved) setOpen(null);
                          });
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shown until the first answer from the planner arrives. */
export function CheckInLoading() {
  return <Loading what="the check-in" />;
}

/** The check-in on Today. It says what was saved on a status line and moves the keyboard there. */
export function CheckIn() {
  const waiting = useCheckIn();
  const timetable = useTimetable();
  const record = useRecordCheckIn();
  const announce = useAnnounce();
  const colours = new Map(
    (timetable.data?.groups ?? []).map((g) => [g.id, g.colour] as const),
  );
  if (waiting.isPending) return <CheckInLoading />;
  if (waiting.isError)
    return (
      <section aria-label="Did these happen as planned?">
        <h2 className="mb-2 text-lg font-semibold">
          Did these happen as planned?
        </h2>
        <p role="alert" className="text-danger">
          Could not load the lessons waiting for an answer.
        </p>
      </section>
    );
  return (
    <div>
      <CheckInView
        weeks={waiting.data.weeks}
        colours={colours}
        busy={record.isPending}
        error={
          record.error
            ? [
                record.error.message,
                ...(record.error instanceof ApiError
                  ? record.error.issues
                  : []),
              ].join(" ")
            : null
        }
        status={<StatusLine announce={announce} className="mb-2" />}
        onSave={async (entries, saved) => {
          record.reset();
          try {
            const done = await record.mutateAsync({ entries });
            announce.say(saved.sentence(done.outOfDate.length > 0));
            return true;
          } catch {
            // the alert above the weeks says why; the form stays as she left it
            return false;
          }
        }}
      />
    </div>
  );
}
