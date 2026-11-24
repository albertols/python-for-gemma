import { useId, useState } from "react";
import { ApiError } from "../../api/client.ts";
import {
  type Exam,
  type ExamBody,
  useCreateExam,
  useExams,
  useRemoveExam,
  useTimetable,
  useUpdateExam,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { longDate } from "../../lib/dates.ts";

const field = "rounded-md border border-border bg-card px-2 py-1";
const MAX_TITLE = 120;
const MAX_CODE = 20;

const blank: ExamBody = {
  code: "",
  title: "",
  date: "",
  session: "morning",
  durationMinutes: 90,
  groupIds: [],
  source: null,
};

function ExamForm({
  exam,
  groups,
  onDone,
}: {
  exam: Exam | null;
  groups: { id: string; colour: string }[];
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const create = useCreateExam();
  const update = useUpdateExam();
  const save = exam ? update : create;
  const [draft, setDraft] = useState<ExamBody>(() => {
    if (!exam) return { ...blank };
    const { id: _id, ...body } = exam;
    return body;
  });
  const set = (patch: Partial<ExamBody>) => {
    save.reset();
    setDraft((d) => ({ ...d, ...patch }));
  };
  const ready =
    draft.code.trim() !== "" &&
    draft.title.trim() !== "" &&
    draft.date !== "" &&
    draft.durationMinutes > 0 &&
    draft.groupIds.length > 0;
  return (
    <form
      aria-labelledby={`${ids}-title`}
      className="mt-3 space-y-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const done = () => onDone(`Saved ${draft.code}.`);
        if (exam) update.mutate({ id: exam.id, ...draft }, { onSuccess: done });
        else create.mutate(draft, { onSuccess: done });
      }}
    >
      <h4 id={`${ids}-title`} className="font-semibold">
        {exam ? `Edit ${exam.code}` : "Add an exam"}
      </h4>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="block text-sm">Code</span>
          <input
            type="text"
            className={field}
            maxLength={MAX_CODE}
            aria-describedby={`${ids}-hint`}
            value={draft.code}
            onChange={(e) => set({ code: e.target.value })}
          />
        </label>
        <label className="block grow">
          <span className="block text-sm">Title</span>
          <input
            type="text"
            className={`${field} w-full`}
            maxLength={MAX_TITLE}
            aria-describedby={`${ids}-hint`}
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
      </div>
      <p id={`${ids}-hint`} className="text-sm text-muted-foreground">
        No student names
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="block text-sm">Date</span>
          <input
            type="date"
            className={field}
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="block text-sm">Session</span>
          <select
            className={field}
            value={draft.session}
            onChange={(e) =>
              set({ session: e.target.value as ExamBody["session"] })
            }
          >
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Length in minutes</span>
          <input
            type="number"
            min={1}
            className={`${field} w-28`}
            value={draft.durationMinutes}
            onChange={(e) => set({ durationMinutes: Number(e.target.value) })}
          />
        </label>
      </div>
      <fieldset>
        <legend className="font-medium">Which of your groups sit it</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.groupIds.includes(g.id)}
                onChange={() =>
                  set({
                    groupIds: draft.groupIds.includes(g.id)
                      ? draft.groupIds.filter((id) => id !== g.id)
                      : [...draft.groupIds, g.id],
                  })
                }
              />
              <GroupBadge id={g.id} colour={g.colour} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={!ready || save.isPending}
        >
          Save exam
        </Button>
        <Button type="button" onClick={() => onDone("")}>
          Cancel
        </Button>
      </div>
      {save.isError ? (
        <ErrorState title="It was not saved" message={save.error.message}>
          {save.error instanceof ApiError && save.error.issues.length > 1 ? (
            <ul className="mt-2 list-disc pl-5">
              {save.error.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </ErrorState>
      ) : null}
    </form>
  );
}

/** Her official exams: public timetable data she can correct, add to or remove. Free text is the title and code only. */
export function ExamsCard() {
  const exams = useExams();
  const timetable = useTimetable();
  const remove = useRemoveExam();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const colours = new Map(
    (timetable.data?.groups ?? []).map((g) => [g.id, g.colour]),
  );
  const groups = timetable.data?.groups ?? [];
  const close = (text: string) => {
    setEditing(null);
    if (text !== "") setMessage(text);
  };

  return (
    <section
      aria-labelledby="exams-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="exams-title" className="text-xl font-semibold">
        Official exams
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        From the exam board's published timetables. They show in Coming up on
        Today and in the slot audit.
      </p>
      {exams.isPending ? <Loading what="the exams" /> : null}
      {exams.isError ? <ErrorState message={exams.error.message} /> : null}
      {exams.data && exams.data.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No official exams">
            Add the exams your groups sit.
          </EmptyState>
        </div>
      ) : null}
      {exams.data && exams.data.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {exams.data.map((e) => (
            <li
              key={e.id}
              data-exam={e.code}
              className="rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {e.code} {e.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {longDate(e.date)}, {e.session}, {e.durationMinutes} minutes
                    {" · "}
                    {e.groupIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 ? ", " : ""}
                        <GroupBadge id={id} colour={colours.get(id)} />
                      </span>
                    ))}
                    {" · "}
                    {e.source ? (
                      <a
                        href={e.source}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                        aria-label={`Source of ${e.code}`}
                      >
                        Source
                      </a>
                    ) : (
                      "No source recorded"
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    aria-label={`Edit ${e.code}`}
                    onClick={() => {
                      setMessage(null);
                      setEditing(e.id);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    aria-label={`Remove ${e.code}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      setMessage(null);
                      remove.mutate(e.id, {
                        onSuccess: () => setMessage(`Removed ${e.code}.`),
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {editing === e.id ? (
                <ExamForm exam={e} groups={groups} onDone={close} />
              ) : null}
            </li>
          ))}
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
      {editing === "new" ? (
        <ExamForm exam={null} groups={groups} onDone={close} />
      ) : (
        <div className="mt-3">
          <Button
            type="button"
            onClick={() => {
              setMessage(null);
              setEditing("new");
            }}
          >
            Add an exam
          </Button>
        </div>
      )}
      {message !== null && !remove.isError ? (
        <p role="status" className="mt-3">
          {message}
        </p>
      ) : null}
    </section>
  );
}
