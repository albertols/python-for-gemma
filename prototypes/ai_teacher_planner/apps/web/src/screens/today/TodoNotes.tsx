import { MAX_TODO_TEXT } from "@planner/domain";
import { type FormEvent, useId, useState } from "react";
import {
  type TodoNoteData,
  useAddTodo,
  useRemoveTodo,
  useTodos,
  useUpdateTodo,
} from "../../api/queries.ts";
import { Button } from "../../components/ui/button.tsx";
import { fullDay, shortDate } from "../../lib/dates.ts";

/** Where a carried-over note came from, so "Still to do" says how old it is. */
function origin(note: TodoNoteData): string {
  return note.scope === "week"
    ? `Week of ${shortDate(note.date)}`
    : fullDay(note.date);
}

/** One sticky note. Its text is always a text node, so markup she typed is shown, never run. */
export function TodoNoteItem({
  note,
  late = false,
  onToggle,
  onRemove,
}: {
  note: TodoNoteData;
  /** A note carried over from an earlier day or week. */
  late?: boolean;
  onToggle: (done: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={`flex items-start gap-2 rounded-md px-3 py-2 shadow-sm ${
        late ? "bg-note-late-bg text-note-late-fg" : "bg-note-bg text-note-fg"
      }`}
    >
      <label className="flex min-w-0 flex-1 items-start gap-2">
        <input
          type="checkbox"
          className="mt-1.5 size-4 shrink-0"
          checked={note.done}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 break-words">
          <span className={note.done ? "line-through" : undefined}>
            {note.text}
          </span>
          {note.done ? <span className="ml-1 text-sm">(done)</span> : null}
          {late ? (
            <span className="block text-sm">From {origin(note)}</span>
          ) : null}
        </span>
      </label>
      <Button
        type="button"
        className="shrink-0"
        aria-label={`Remove note: ${note.text}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </li>
  );
}

function NoteList({
  title,
  notes,
  empty,
  late = false,
}: {
  title: string;
  notes: TodoNoteData[];
  empty: string;
  late?: boolean;
}) {
  const id = useId();
  const update = useUpdateTodo();
  const remove = useRemoveTodo();
  return (
    <section aria-labelledby={id} className="mt-4">
      <h3 id={id} className="mb-2 font-semibold">
        {title}
      </h3>
      {notes.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <TodoNoteItem
              key={n.id}
              note={n}
              late={late}
              onToggle={(done) => update.mutate({ id: n.id, done })}
              onRemove={() => remove.mutate(n.id)}
            />
          ))}
        </ul>
      )}
      {update.isError || remove.isError ? (
        <p role="alert" className="mt-1 text-danger">
          {(update.error ?? remove.error)?.message}
        </p>
      ) : null}
    </section>
  );
}

function AddNote({ today }: { today: string }) {
  const ids = useId();
  const add = useAddTodo();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"day" | "week">("day");
  const blank = text.trim() === "";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blank) return;
    add.mutate({ text, scope, date: today }, { onSuccess: () => setText("") });
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div>
        <label htmlFor={`${ids}-text`} className="font-semibold">
          Add a note
        </label>
        <input
          id={`${ids}-text`}
          type="text"
          className="mt-1 block w-full rounded-md border border-border bg-card px-2 py-1"
          maxLength={MAX_TODO_TEXT}
          aria-describedby={`${ids}-hint`}
          placeholder="For example, Print the case study"
          value={text}
          onChange={(e) => {
            add.reset();
            setText(e.target.value);
          }}
        />
        <p id={`${ids}-hint`} className="mt-1 text-sm text-muted-foreground">
          No student names
        </p>
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">When it is for</legend>
        {(
          [
            ["day", "Today"],
            ["week", "This week"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name={`${ids}-scope`}
              checked={scope === value}
              onChange={() => setScope(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {add.isError ? (
        <p role="alert" className="text-danger">
          {add.error.message}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={blank || add.isPending}>
        Save note
      </Button>
    </form>
  );
}

/** The sticky notes beside today's lessons: Today, This week and Still to do. */
export function TodoNotes({ today }: { today: string }) {
  const todos = useTodos(today);
  return (
    <section aria-label="To-do notes">
      <h2 className="text-lg font-semibold">To-do notes</h2>
      <AddNote today={today} />
      {todos.isPending ? (
        <p className="mt-4 text-muted-foreground">Loading your notes...</p>
      ) : todos.isError ? (
        <p role="alert" className="mt-4 text-danger">
          {todos.error.message}
        </p>
      ) : (
        <>
          <NoteList
            title="Today"
            notes={todos.data.today}
            empty="Nothing for today yet."
          />
          <NoteList
            title="This week"
            notes={todos.data.week}
            empty="Nothing for this week yet."
          />
          <NoteList
            title="Still to do"
            notes={todos.data.stillToDo}
            empty="Nothing left over."
            late
          />
        </>
      )}
    </section>
  );
}
