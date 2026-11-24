import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TodoNoteItem } from "./TodoNotes.tsx";

const note = {
  id: "n1",
  text: "Print the Unit 4 case study",
  scope: "day" as const,
  date: "2026-11-20",
  done: false,
  createdAt: "2026-11-20T09:00:00.000Z",
};
const html = (over: Partial<typeof note> = {}) =>
  renderToStaticMarkup(
    createElement(TodoNoteItem, {
      note: { ...note, ...over },
      onToggle: () => {},
      onRemove: () => {},
    }),
  );

test("an undone note has an unticked box named after it, and a Remove button", () => {
  const out = html();
  expect(out).toContain('type="checkbox"');
  expect(out).not.toContain("checked");
  expect(out).toContain("Print the Unit 4 case study");
  expect(out).toContain("Remove note: Print the Unit 4 case study");
});

test("a done note is struck through and says done in words", () => {
  const out = html({ done: true });
  expect(out).toContain("line-through");
  expect(out).toContain("checked");
  expect(out).toContain("(done)");
});

test("markup in a note is shown as text, never run", () => {
  const out = html({ text: "<script>alert(1)</script>" });
  expect(out).not.toContain("<script>");
  expect(out).toContain("&lt;script&gt;");
});
