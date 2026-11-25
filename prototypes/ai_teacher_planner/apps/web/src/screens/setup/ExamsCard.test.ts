import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ExamSummary } from "./ExamsCard.tsx";

const exam = {
  id: "x1",
  code: "WBS14 01",
  title: "IAL Business Unit 4",
  date: "2027-06-01",
  session: "morning" as const,
  durationMinutes: 120,
  groupIds: ["13 1"],
  source: "https://example.test/ial.pdf" as string | null,
};
const html = (over: Partial<typeof exam>) =>
  renderToStaticMarkup(
    createElement(ExamSummary, {
      exam: { ...exam, ...over },
      colours: new Map(),
    }),
  );

test("an https source is a link", () =>
  expect(html({})).toContain('href="https://example.test/ial.pdf"'));

test.each([
  ["a javascript address", "javascript:alert(1)"],
  ["a plain http address", "http://example.test/a.pdf"],
  ["a data address", "data:text/html,<script>1</script>"],
])("%s is never a link", (_n, source) => {
  const out = html({ source });
  expect(out).not.toContain("<a ");
  expect(out).not.toContain("href=");
  expect(out).toContain("No source link");
});

test("no source says so", () =>
  expect(html({ source: null })).toContain("No source link"));

test("a title with markup is shown as text", () => {
  const out = html({ title: "<script>alert(1)</script><b>x</b>" });
  expect(out).not.toContain("<script>");
  expect(out).not.toContain("<b>x</b>");
  expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
});
