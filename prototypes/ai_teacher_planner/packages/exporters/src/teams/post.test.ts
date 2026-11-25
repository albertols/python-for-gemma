import { expect, test } from "vitest";
import { aiProvenance, lesson, WEEK_OF_23_NOV } from "../test-data.ts";
import { teamsPostText } from "./post.ts";

const args = {
  groupId: "13 1",
  weekOf: "2026-11-23",
  lessons: WEEK_OF_23_NOV,
};

test("the Teams text lists the group's lessons for the week in date order, with no markup", () =>
  expect(
    teamsPostText({ ...args, lessons: [...WEEK_OF_23_NOV].reverse() }),
  ).toEqual({
    text: "13 1: week of 23 November\nMon 23 Nov P5: 2 Supply (3 of 4)\nWed 25 Nov P2: 2 Supply (4 of 4)\nFri 27 Nov P6: Assessment: Chapters 1-2",
    warning: null,
  }));

test("only this group and this week are in the post", () => {
  const other = [
    lesson({ groupId: "13 3", title: "Another group" }),
    lesson({ date: "2026-11-30", title: "Next week" }),
    lesson({ date: "2026-11-22", title: "Sunday before" }),
  ];
  const { text } = teamsPostText({
    ...args,
    lessons: [...WEEK_OF_23_NOV, ...other],
  });
  expect(text).not.toContain("Another group");
  expect(text).not.toContain("Next week");
  expect(text).not.toContain("Sunday before");
});

test("a cover lesson or a skipped one says so, a planned one says nothing", () => {
  const { text } = teamsPostText({
    ...args,
    lessons: [
      lesson({ period: 1, title: "A", state: "cover" }),
      lesson({ period: 2, title: "B", state: "skipped" }),
      lesson({ period: 3, title: "C", state: "assumed" }),
    ],
  });
  expect(text.split("\n").slice(1)).toEqual([
    "Mon 23 Nov P1: A (cover)",
    "Mon 23 Nov P2: B (not taught)",
    "Mon 23 Nov P3: C",
  ]);
});

test("an AI lesson she has not reviewed is left out and the warning counts it", () => {
  const { text, warning } = teamsPostText({
    ...args,
    lessons: [
      ...WEEK_OF_23_NOV,
      lesson({
        period: 1,
        title: "Unreviewed",
        provenance: aiProvenance("suggested"),
      }),
      lesson({
        period: 2,
        title: "Rejected",
        provenance: aiProvenance("rejected"),
      }),
    ],
    heldBack: [{ provenance: aiProvenance("suggested") }],
  });
  expect(text).not.toContain("Unreviewed");
  expect(text).not.toContain("Rejected");
  expect(warning).toBe(
    "2 AI suggestions were left out because you have not reviewed them. 1 rejected AI suggestion was left out.",
  );
});

test("a reviewed AI lesson is in the post and the post says AI drafted it", () => {
  const { text, warning } = teamsPostText({
    ...args,
    lessons: [
      lesson({ title: "Drafted", provenance: aiProvenance("accepted") }),
    ],
  });
  expect(text).toBe(
    "13 1: week of 23 November\nMon 23 Nov P5: Drafted\n1 item was drafted by AI and reviewed on 2026-11-24.",
  );
  expect(warning).toBeNull();
});

test("a week with no lessons says so", () =>
  expect(teamsPostText({ ...args, lessons: [] }).text).toBe(
    "13 1: week of 23 November\nNo lessons this week.",
  ));
