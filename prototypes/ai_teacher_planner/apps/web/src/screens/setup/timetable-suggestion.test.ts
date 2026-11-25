import { expect, test } from "vitest";
import type { AiItemView } from "../../api/jobs.ts";
import { cellName, gridOf, pictureProblem } from "./timetable-suggestion.ts";

const item = (over: Partial<AiItemView>): AiItemView => ({
  id: "i1",
  runId: "r1",
  kind: "timetable-grid",
  target: "2026-27",
  courseId: null,
  review: "suggested",
  reviewedAt: null,
  sources: [],
  data: { versionId: "2026-27", entries: [], duties: [], unsure: [] },
  ...over,
});

test("a timetable-grid item gives its grid; any other item, or odd data, gives nothing", () => {
  expect(gridOf(item({}))).toEqual({
    versionId: "2026-27",
    entries: [],
    duties: [],
    unsure: [],
  });
  expect(gridOf(item({ kind: "lesson-count" }))).toBeNull();
  expect(gridOf(item({ data: "nope" }))).toBeNull();
  expect(gridOf(item({ data: { versionId: "x", entries: 1 } }))).toBeNull();
});

test("a cell is named as the editor names it", () => {
  expect(cellName({ week: "W1", weekday: 2, period: 1 })).toBe(
    "Week 1, Tuesday, period 1",
  );
  expect(cellName({ week: "W2", weekday: 5, period: 6 })).toBe(
    "Week 2, Friday, period 6",
  );
});

test("a picture over 5 MB, or not PNG or JPEG, is turned away in the browser with a sentence", () => {
  const file = (type: string, size: number) => ({ type, size });
  expect(pictureProblem(file("image/png", 5 * 1024 * 1024))).toBeNull();
  expect(pictureProblem(file("image/jpeg", 100))).toBeNull();
  expect(pictureProblem(file("image/png", 5 * 1024 * 1024 + 1))).toBe(
    "That picture is over 5 MB. Choose a smaller one, or a screenshot instead of a photo.",
  );
  expect(pictureProblem(file("application/pdf", 100))).toBe(
    "Choose a PNG or JPG picture.",
  );
});
