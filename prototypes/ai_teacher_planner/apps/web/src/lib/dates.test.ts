import { expect, test } from "vitest";
import { daysLeftInWords, fullDayWithYear } from "./dates.ts";

test("days left are said in words", () => {
  expect(daysLeftInWords(0)).toBe("today");
  expect(daysLeftInWords(1)).toBe("tomorrow");
  expect(daysLeftInWords(10)).toBe("in 10 days");
});

test("a full day has no comma after the weekday", () => {
  expect(fullDayWithYear("2026-11-20")).toBe("Friday 20 November 2026");
});
