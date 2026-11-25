import { expect, test } from "vitest";
import {
  answerSentence,
  confirmSentence,
  groupsOf,
  lessonLabel,
  MAX_WEEKS,
  moreWeeksSentence,
  type WaitingLesson,
  weekHeading,
  weeksToShow,
} from "./check-in-model.ts";

const lesson = (
  groupId: string,
  lessonId: string,
  date: string,
  title = "Demand",
): WaitingLesson => ({
  index: Number(lessonId.split("#")[1]),
  of: 3,
  courseId: "ial-business-u4",
  groupId,
  lessonId,
  slotKey: `${groupId}|${date}|5`,
  date,
  title,
});
const week = (weekOf: string) => ({ weekOf, lessons: [] });

test("at most four weeks are shown, the oldest first, and the rest are counted", () => {
  const weeks = ["10-05", "10-12", "10-19", "10-26", "11-02", "11-09"].map(
    (d) => week(`2026-${d}`),
  );
  const { shown, hidden } = weeksToShow(weeks);
  expect(MAX_WEEKS).toBe(4);
  expect(shown.map((w) => w.weekOf)).toEqual([
    "2026-10-05",
    "2026-10-12",
    "2026-10-19",
    "2026-10-26",
  ]);
  expect(hidden).toBe(2);
  expect(weeksToShow(weeks.slice(0, 4))).toEqual({
    shown: weeks.slice(0, 4),
    hidden: 0,
  });
  expect(weeksToShow([])).toEqual({ shown: [], hidden: 0 });
});

test("the words for the weeks that are not shown", () => {
  expect(moreWeeksSentence(1)).toBe("and 1 more week");
  expect(moreWeeksSentence(3)).toBe("and 3 more weeks");
});

test("a week's lessons are grouped one row per group, groups in order, lessons by date", () => {
  const rows = groupsOf([
    lesson("13 3", "ch1#1", "2026-10-26"),
    lesson("13 1", "ch1#2", "2026-10-28"),
    lesson("13 1", "ch1#1", "2026-10-26"),
    lesson("13 3", "ch1#2", "2026-10-30"),
  ]);
  expect(
    rows.map((r) => [r.groupId, r.lessons.map((l) => l.lessonId)]),
  ).toEqual([
    ["13 1", ["ch1#1", "ch1#2"]],
    ["13 3", ["ch1#1", "ch1#2"]],
  ]);
});

test("headings and the sentences that say what was saved", () => {
  expect(weekHeading("2026-11-16")).toBe("Week of Monday 16 November");
  expect(confirmSentence("13 1", "2026-11-16")).toBe(
    "Confirmed 13 1 for the week of Monday 16 November.",
  );
  const l = lesson("13 3", "ch1#1", "2026-10-26");
  expect(answerSentence(l, "skipped", false)).toBe(
    "13 3, Demand 1 of 3, Monday 26 October, period 5: saved as skipped.",
  );
  expect(answerSentence(l, "homework", false)).toBe(
    "13 3, Demand 1 of 3, Monday 26 October, period 5: saved as set as homework.",
  );
  expect(answerSentence(l, "cover", true)).toBe(
    "13 3, Demand 1 of 3, Monday 26 October, period 5: saved as cover. The plan is now out of date: the notice above offers See what changes.",
  );
});

test("each lesson is named by its number and period, so the halves of a double differ", () => {
  const a = lesson("13 3", "ch1#2", "2026-11-12");
  const b = {
    ...lesson("13 3", "ch1#3", "2026-11-12"),
    slotKey: "13 3|2026-11-12|4",
  };
  expect(lessonLabel(a)).toBe("Demand 2 of 3, Thursday 12 November, period 5");
  expect(lessonLabel(b)).toBe("Demand 3 of 3, Thursday 12 November, period 4");
  // a spare lesson has no number
  expect(
    lessonLabel({
      ...a,
      lessonId: "flex:13 3:cp:a-ch3#1",
      title: "Past paper",
      index: null,
      of: null,
    }),
  ).toBe("Past paper, Thursday 12 November, period 5");
});
