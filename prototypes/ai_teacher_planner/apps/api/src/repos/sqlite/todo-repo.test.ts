import type { TodoNote } from "@planner/domain";
import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

const note = (id: string, over: Partial<TodoNote> = {}): TodoNote => ({
  id,
  text: "Print the Unit 4 case study",
  scope: "day",
  date: "2026-11-20",
  done: false,
  createdAt: "2026-11-20T09:00:00.000Z",
  ...over,
});

test("a note comes back as stored, oldest first, then by id", () => {
  const { todos } = createRepos(migratedDb());
  expect(todos.list()).toEqual([]);
  const later = note("a", { createdAt: "2026-11-20T10:00:00.000Z" });
  todos.insert(later);
  todos.insert(note("c", { scope: "week", date: "2026-11-16", done: true }));
  todos.insert(note("b"));
  expect(todos.list()).toEqual([
    note("b"),
    note("c", { scope: "week", date: "2026-11-16", done: true }),
    later,
  ]);
});

test("text is kept exactly as given, markup included", () => {
  const { todos } = createRepos(migratedDb());
  const text = "<script>alert(1)</script> & 'quotes'";
  todos.insert(note("a", { text }));
  expect(todos.list()[0]?.text).toBe(text);
});

test("update changes only what it is given and returns the note; an unknown id gives null", () => {
  const { todos } = createRepos(migratedDb());
  todos.insert(note("a"));
  expect(todos.update("a", { done: true })).toEqual(note("a", { done: true }));
  expect(todos.update("a", { text: "Changed" })).toEqual(
    note("a", { done: true, text: "Changed" }),
  );
  expect(todos.update("a", { done: false })?.done).toBe(false);
  expect(todos.update("nope", { done: true })).toBeNull();
});

test("removing says whether anything went and puts nothing back", () => {
  const { todos } = createRepos(migratedDb());
  todos.insert(note("a"));
  expect(todos.remove("a")).toBe(true);
  expect(todos.remove("a")).toBe(false);
  expect(todos.list()).toEqual([]);
});

test("a scope other than day or week cannot be stored", () => {
  const { todos } = createRepos(migratedDb());
  expect(() =>
    todos.insert(note("a", { scope: "month" as TodoNote["scope"] })),
  ).toThrow();
});
