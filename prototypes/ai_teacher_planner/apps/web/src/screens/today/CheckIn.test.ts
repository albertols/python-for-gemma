import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CheckInLoading, CheckInView } from "./CheckIn.tsx";
import type { WaitingWeek } from "./check-in-model.ts";

const week = (weekOf: string, groups: string[]): WaitingWeek => ({
  weekOf,
  lessons: groups.map((g) => ({
    courseId: "ial-business-u4",
    groupId: g,
    lessonId: "ch1#1",
    slotKey: `${g}|${weekOf}|5`,
    date: weekOf,
    title: "Demand",
    index: 1,
    of: 3,
  })),
});
const html = (weeks: WaitingWeek[], error: string | null = null) =>
  renderToStaticMarkup(
    createElement(CheckInView, {
      weeks,
      colours: new Map(),
      busy: false,
      error,
      onSave: async () => true,
    }),
  );
const MONDAYS = [
  "2026-10-05",
  "2026-10-12",
  "2026-10-19",
  "2026-10-26",
  "2026-11-02",
  "2026-11-09",
];

test("six waiting weeks show the oldest four and say how many are left", () => {
  const out = html(MONDAYS.map((m) => week(m, ["13 1"])));
  expect(out.match(/<h3/g)).toHaveLength(4);
  expect(out).toContain("Week of Monday 5 October");
  expect(out).toContain("Week of Monday 26 October");
  expect(out).not.toContain("Week of Monday 2 November");
  expect(out).toContain("and 2 more weeks");
});

test("four weeks or fewer say nothing about more", () => {
  expect(html(MONDAYS.slice(0, 4).map((m) => week(m, ["13 1"])))).not.toContain(
    "more week",
  );
});

test("each group has one button for its whole week and each lesson its own way out", () => {
  const out = html([week("2026-11-16", ["13 1", "13 3"])]);
  expect(out.match(/Confirm 13 [13]/g)).toHaveLength(2);
  expect(out).toContain("for the week of Monday 16 November");
  expect(out).toContain(
    'aria-label="Not as planned: 13 3, Demand 1 of 3, Monday 16 November, period 5"',
  );
});

test("with nothing waiting it says so in one line", () => {
  const out = html([]);
  expect(out).toContain("Nothing to confirm: every past lesson has an answer.");
  expect(out).not.toContain("<h3");
});

test("a refused save is shown as an alert", () => {
  expect(html([week("2026-11-16", ["13 1"])], "Nothing was saved.")).toContain(
    'role="alert"',
  );
});

test("two lessons of a double have different button names and legends", () => {
  const w = week("2026-11-09", ["13 3"]);
  const [first] = w.lessons;
  if (!first) throw new Error("a lesson");
  w.lessons = [
    {
      ...first,
      lessonId: "ch1#2",
      slotKey: "13 3|2026-11-12|3",
      date: "2026-11-12",
      index: 2,
    },
    {
      ...first,
      lessonId: "ch1#3",
      slotKey: "13 3|2026-11-12|4",
      date: "2026-11-12",
      index: 3,
    },
  ];
  const out = html([w]);
  const names = [...out.matchAll(/aria-label="(Not as planned[^"]*)"/g)].map(
    (m) => m[1],
  );
  expect(names).toEqual([
    "Not as planned: 13 3, Demand 2 of 3, Thursday 12 November, period 3",
    "Not as planned: 13 3, Demand 3 of 3, Thursday 12 November, period 4",
  ]);
});

test("while the lessons load, the section says so", () => {
  expect(renderToStaticMarkup(createElement(CheckInLoading))).toContain(
    "Loading the check-in",
  );
});
