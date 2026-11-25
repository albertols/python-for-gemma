import { expect, test } from "vitest";
import {
  groupTodos,
  MAX_TODO_TEXT,
  type TodoNote,
  todoTextIssue,
} from "./todos.ts";

const note = (id: string, over: Partial<TodoNote> = {}): TodoNote => ({
  id,
  text: id,
  scope: "day",
  date: "2026-11-20",
  done: false,
  createdAt: "2026-11-20T09:00:00.000Z",
  ...over,
});

test("a note is today's, this week's or still to do, and nothing else is shown", () => {
  const notes = [
    note("today"),
    note("week", { scope: "week", date: "2026-11-16" }),
    note("old-day", { date: "2026-11-19" }),
    note("old-week", { scope: "week", date: "2026-11-09" }),
    note("later-day", { date: "2026-11-21" }),
    note("later-week", { scope: "week", date: "2026-11-23" }),
  ];
  const g = groupTodos(notes, "2026-11-20");
  expect(g.today.map((n) => n.id)).toEqual(["today"]);
  expect(g.week.map((n) => n.id)).toEqual(["week"]);
  expect(g.stillToDo.map((n) => n.id)).toEqual(["old-day", "old-week"]);
});

test("a week note from this week is not still to do, even though its Monday is before today", () => {
  const g = groupTodos(
    [note("w", { scope: "week", date: "2026-11-16" })],
    "2026-11-20",
  );
  expect(g.stillToDo).toEqual([]);
});

test("done notes stay where they belong and never carry over", () => {
  const g = groupTodos(
    [
      note("t", { done: true }),
      note("old", { date: "2026-11-19", done: true }),
    ],
    "2026-11-20",
  );
  expect(g.today.map((n) => n.id)).toEqual(["t"]);
  expect(g.stillToDo).toEqual([]);
});

test("each list is sorted by creation time, then id", () => {
  const g = groupTodos(
    [
      note("b", { createdAt: "2026-11-20T09:00:00.000Z" }),
      note("c", { createdAt: "2026-11-20T08:00:00.000Z" }),
      note("a", { createdAt: "2026-11-20T09:00:00.000Z" }),
    ],
    "2026-11-20",
  );
  expect(g.today.map((n) => n.id)).toEqual(["c", "a", "b"]);
});

test("text is refused when empty or over 200 characters after trimming", () => {
  expect(todoTextIssue("")).not.toBeNull();
  expect(todoTextIssue("   ")).not.toBeNull();
  expect(todoTextIssue("x".repeat(MAX_TODO_TEXT))).toBeNull();
  expect(todoTextIssue(`  ${"x".repeat(MAX_TODO_TEXT)}  `)).toBeNull();
  expect(todoTextIssue("x".repeat(MAX_TODO_TEXT + 1))).toBe(
    "A note can be at most 200 characters.",
  );
  expect(todoTextIssue("<script>alert(1)</script>")).toBeNull();
});
