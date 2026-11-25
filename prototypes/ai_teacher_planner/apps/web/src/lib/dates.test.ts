import { expect, test } from "vitest";
import { daysLeftInWords, fullDayWithYear, whenOf } from "./dates.ts";

test("days left are said in words", () => {
  expect(daysLeftInWords(0)).toBe("today");
  expect(daysLeftInWords(1)).toBe("tomorrow");
  expect(daysLeftInWords(10)).toBe("in 10 days");
});

test("a full day has no comma after the weekday", () => {
  expect(fullDayWithYear("2026-11-20")).toBe("Friday 20 November 2026");
});

test("a run's time is said in the school's time zone, not the computer's", () => {
  // 10:00 UTC on 24 November is 11:00 in Madrid (winter time)
  expect(whenOf("2026-11-24T10:00:00.000Z", "Europe/Madrid")).toBe(
    "24 November 2026, 11:00",
  );
  expect(whenOf("2026-06-24T22:30:00.000Z", "Europe/Madrid")).toBe(
    "25 June 2026, 00:30",
  );
});
