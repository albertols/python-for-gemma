import { type IsoDate, mondayOf } from "./dates.ts";

/** One sticky note. For a "week" note, `date` is that week's Monday. */
export interface TodoNote {
  id: string;
  text: string;
  scope: "day" | "week";
  date: IsoDate;
  done: boolean;
  /** When the API stored it. Notes are listed oldest first. */
  createdAt: string;
}

export const MAX_TODO_TEXT = 200;

/** Why this (already trimmed) text cannot be a note; null when it can. */
export function todoTextIssue(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return "Write something in the note.";
  if ([...trimmed].length > MAX_TODO_TEXT)
    return `A note can be at most ${MAX_TODO_TEXT} characters.`;
  return null;
}

export interface GroupedTodos {
  today: TodoNote[];
  week: TodoNote[];
  /** Undone notes from earlier days or earlier weeks. */
  stillToDo: TodoNote[];
}

const oldestFirst = (a: TodoNote, b: TodoNote) =>
  a.createdAt < b.createdAt
    ? -1
    : a.createdAt > b.createdAt
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

/** Sorts every note into the list it is shown in on `date`. A note from a later day or week is in none. */
export function groupTodos(
  notes: readonly TodoNote[],
  date: IsoDate,
): GroupedTodos {
  const monday = mondayOf(date);
  const sorted = [...notes].sort(oldestFirst);
  return {
    today: sorted.filter((n) => n.scope === "day" && n.date === date),
    week: sorted.filter((n) => n.scope === "week" && n.date === monday),
    stillToDo: sorted.filter(
      (n) => !n.done && (n.scope === "day" ? n.date < date : n.date < monday),
    ),
  };
}
