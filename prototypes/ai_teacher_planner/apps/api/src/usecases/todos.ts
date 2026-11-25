import {
  groupTodos,
  type IsoDate,
  mondayOf,
  type TodoNote,
  todoTextIssue,
} from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { Repos } from "../repos/ports.ts";

function checkedText(text: string): string {
  const issue = todoTextIssue(text);
  if (issue) throw new ApiError(422, "invalid-note", issue);
  return text.trim();
}

export function listTodos(repos: Repos, date: IsoDate) {
  return groupTodos(repos.todos.list(), date);
}

/** The id and the time come from here (the API), not from the domain. A week note is kept on its Monday. */
export function createTodo(
  repos: Repos,
  input: { text: string; scope: "day" | "week"; date: IsoDate },
  now: Date,
): TodoNote {
  const note: TodoNote = {
    id: crypto.randomUUID(),
    text: checkedText(input.text),
    scope: input.scope,
    date: input.scope === "week" ? mondayOf(input.date) : input.date,
    done: false,
    createdAt: now.toISOString(),
  };
  repos.todos.insert(note);
  return note;
}

export function updateTodo(
  repos: Repos,
  id: string,
  patch: { text?: string | undefined; done?: boolean | undefined },
): TodoNote {
  if (patch.text === undefined && patch.done === undefined)
    throw new ApiError(422, "empty-patch", "Say what to change: text or done.");
  const changes = {
    ...(patch.text === undefined ? {} : { text: checkedText(patch.text) }),
    ...(patch.done === undefined ? {} : { done: patch.done }),
  };
  const note = repos.todos.update(id, changes);
  if (!note) throw new ApiError(404, "no-such-note", "There is no such note.");
  return note;
}

export function removeTodo(repos: Repos, id: string): void {
  if (!repos.todos.remove(id))
    throw new ApiError(404, "no-such-note", "There is no such note to remove.");
}
