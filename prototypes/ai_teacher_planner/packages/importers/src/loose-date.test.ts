import { expect, test } from "vitest";
import { parseLooseDate } from "./loose-date.ts";

const ay = { start: 2026, end: 2027 };

// These strings are the forms found in the school's file.
test.each([
  ["Monday 30th November 2026", "2026-11-30", []],
  ["Tuesday, April 6th 2027", "2027-04-06", []],
  ["Thursday June 10th 2027", "2027-06-10", []],
  ["Friday, June 25th June 2027", "2027-06-25", []],
  ["Monday  26th April 2027", "2027-04-26", []],
  ["Thursday 11th December 2026", "2026-12-11", ["weekday-mismatch"]],
  ["Thursday 4th February GCSE Mock report", "2027-02-04", ["no-year"]],
  ["Parent Meeting: Nov 12", "2026-11-12", ["no-year"]],
  ["Mop Up Parent Meeting: June 24", "2027-06-24", ["no-year"]],
  ["KS5 Curric Open eve (Year 11)  Nov 10", "2026-11-10", ["no-year"]],
  ["Thursday 17th December 2025", null, ["year-outside-academic-year"]],
  ["to be confirmed", null, ["unparseable"]],
])("parseLooseDate(%s)", (text, date, issues) =>
  expect(parseLooseDate(text, ay)).toMatchObject({ date, issues, raw: text }),
);

test("an impossible day is unparseable", () =>
  expect(parseLooseDate("30 February 2027", ay)).toMatchObject({
    date: null,
    issues: ["unparseable"],
  }));

test("Sept and any case are accepted", () =>
  expect(parseLooseDate("SEPT 3", ay)).toMatchObject({ date: "2026-09-03" }));
