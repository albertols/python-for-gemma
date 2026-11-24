import { expect, test } from "vitest";
import { addDays, isIsoDate, mondayOf, weekdayOf } from "./dates.ts";

test("weekdayOf reads the weekday from the date", () => {
  expect(weekdayOf("2027-01-08")).toBe(5);
  expect(weekdayOf("2026-07-11")).toBe(6);
});
test("addDays crosses a month, a year and a leap day", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
});
test("mondayOf", () => expect(mondayOf("2027-01-08")).toBe("2027-01-04"));
test("isIsoDate rejects impossible dates", () => {
  expect(isIsoDate("2027-02-30")).toBe(false);
  expect(isIsoDate("27-02-01")).toBe(false);
  expect(isIsoDate("2028-02-29")).toBe(true);
});
