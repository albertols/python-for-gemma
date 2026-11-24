import { expect, test } from "vitest";
import { whyNoLessons } from "./why-no-lessons.ts";

const none: { slot: { status: string } }[] = [];

test("a weekend says so", () => {
  expect(whyNoLessons({ kind: "weekend", lessons: none }, null)).toBe(
    "It's the weekend.",
  );
});
test("outside term uses the calendar's text, else a plain sentence", () => {
  expect(
    whyNoLessons({ kind: "outside-term", lessons: none }, "Half term"),
  ).toBe("Half term");
  expect(whyNoLessons({ kind: "outside-term", lessons: none }, null)).toBe(
    "It's outside term time.",
  );
});
test("an unlabelled day uses the calendar's text, else a plain sentence", () => {
  expect(
    whyNoLessons({ kind: "unlabelled", lessons: none }, "Official Holiday"),
  ).toBe("Official Holiday");
  expect(whyNoLessons({ kind: "unlabelled", lessons: none }, null)).toBe(
    "There is no school today.",
  );
});
test("a pupil day with nothing timetabled", () => {
  expect(whyNoLessons({ kind: "pupil", lessons: none }, null)).toBe(
    "You have no lessons today.",
  );
});
test("a pupil day where every lesson is cancelled", () => {
  expect(
    whyNoLessons(
      { kind: "pupil", lessons: [{ slot: { status: "cancelled" } }] },
      null,
    ),
  ).toBe("Every lesson today is cancelled.");
});
