import { useId, useState } from "react";
import { useLessonNote, useSaveLessonNote } from "../api/queries.ts";
import { MaterialsList } from "./MaterialsList.tsx";
import { Button } from "./ui/button.tsx";

/** The most a note can hold; the API counts the same way and refuses more. */
export const MAX_LESSON_NOTE = 2000;

/**
 * Her plan for one content lesson and the files for it. It belongs to the lesson,
 * not the slot, so it is still here when the plan moves the lesson. The text is
 * plain, kept as typed, never sent to a model; the box says so with its hint.
 */
export function LessonNotes({
  groupId,
  lessonId,
}: {
  groupId: string;
  lessonId: string;
}) {
  const ids = useId();
  const note = useLessonNote(groupId, lessonId);
  const save = useSaveLessonNote(groupId, lessonId);
  const [draft, setDraft] = useState<string | null>(null);
  if (note.isPending)
    return <p className="text-muted-foreground">Loading the plan...</p>;
  if (note.isError)
    return (
      <p role="alert" className="text-danger">
        {note.error.message}
      </p>
    );
  const text = draft ?? note.data.text;
  const changed = draft !== null && draft.trim() !== note.data.text;
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed) return;
          save.mutate(text, { onSuccess: () => setDraft(null) });
        }}
      >
        <label htmlFor={`${ids}-plan`} className="font-semibold">
          Plan for this lesson
        </label>
        <textarea
          id={`${ids}-plan`}
          rows={5}
          maxLength={MAX_LESSON_NOTE}
          className="mt-1 block w-full rounded-md border border-border bg-card px-2 py-1"
          aria-describedby={`${ids}-hint`}
          value={text}
          onChange={(e) => {
            save.reset();
            setDraft(e.target.value);
          }}
        />
        <p id={`${ids}-hint`} className="mt-1 text-sm text-muted-foreground">
          No student names. {[...text].length} of {MAX_LESSON_NOTE} characters.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={!changed || save.isPending}
          >
            Save plan
          </Button>
          {save.isSuccess && !changed ? (
            <span role="status">Plan saved.</span>
          ) : null}
        </div>
        {save.isError ? (
          <p role="alert" className="mt-1 text-danger">
            {save.error.message}
          </p>
        ) : null}
      </form>
      <MaterialsList
        groupId={groupId}
        lessonId={lessonId}
        materials={note.data.materials}
      />
    </div>
  );
}
