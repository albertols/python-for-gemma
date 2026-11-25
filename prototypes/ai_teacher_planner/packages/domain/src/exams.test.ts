import { SEED_GROUPS } from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  type ExamInput,
  examIssues,
  MAX_EXAM_CODE,
  MAX_EXAM_TITLE,
} from "./exams.ts";

const ok: ExamInput = {
  code: "WBS14 01",
  title: "IAL Business Unit 4",
  date: "2027-06-01",
  session: "morning",
  durationMinutes: 120,
  groupIds: ["13 1"],
  source: null,
};
const issues = (over: Partial<ExamInput>) =>
  examIssues({ ...ok, ...over }, SEED_GROUPS);

test("a complete exam has no issues", () => expect(issues({})).toEqual([]));
test("the title is at most 120 characters and the code at most 20", () => {
  expect(MAX_EXAM_TITLE).toBe(120);
  expect(MAX_EXAM_CODE).toBe(20);
  expect(issues({ title: "x".repeat(120) })).toEqual([]);
  expect(issues({ title: "x".repeat(121) })).toHaveLength(1);
  expect(issues({ code: "x".repeat(20) })).toEqual([]);
  expect(issues({ code: "x".repeat(21) })).toHaveLength(1);
});
test("an empty title or code is refused", () => {
  expect(issues({ title: "  " })).toHaveLength(1);
  expect(issues({ code: "" })).toHaveLength(1);
});
test("a group she does not teach, no group, or a bad duration is refused", () => {
  expect(issues({ groupIds: ["9X"] })).toHaveLength(1);
  expect(issues({ groupIds: [] })).toHaveLength(1);
  expect(issues({ durationMinutes: 0 })).toHaveLength(1);
});

test("a source is nothing or a secure web address, so it is always safe to link", () => {
  expect(issues({ source: "https://example.test/timetable.pdf" })).toEqual([]);
  expect(issues({ source: "javascript:alert(1)" })).toHaveLength(1);
  expect(issues({ source: "http://example.test/a.pdf" })).toHaveLength(1);
  expect(issues({ source: `https://x.test/${"a".repeat(500)}` })).toHaveLength(
    1,
  );
});
