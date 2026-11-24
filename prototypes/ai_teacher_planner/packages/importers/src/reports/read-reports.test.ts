import { buildSyntheticWorkbook } from "@planner/fixtures";
import { expect, test } from "vitest";
import { readParentsEvenings, readReportDeadlines } from "./read-reports.ts";

const ay = { start: 2026, end: 2027 };
const data = await buildSyntheticWorkbook();
const windows = await readReportDeadlines(data, ay);
const evenings = await readParentsEvenings(data, ay);
const y11 = windows.find((w) => w.yearGroup === 11);
if (!y11) throw new Error("no Year 11 window");
const eveningFor = (year: number) => {
  const e = evenings.find((x) => x.yearGroup === year);
  if (!e) throw new Error(`no evening for Year ${year}`);
  return e;
};

test("a Year 12 block takes its programme from its second row", () =>
  expect(
    windows
      .filter((w) => w.yearGroup === 12)
      .map((w) => w.programme)
      .sort(),
  ).toEqual(["A level", "IB"]));
test("Year 11 has no programme", () => expect(y11.programme).toBeNull());
test("the Year 11 long report's name and data deadline", () => {
  expect(y11.name).toBe("Report 2: Long");
  expect(y11.dataDeadline.date).toBe("2026-11-30");
  expect(y11.hodReview.date).toBe("2026-12-04");
});
test("a wrong weekday is kept as an issue, not fixed silently", () => {
  expect(y11.sentHome.date).toBe("2026-12-11");
  expect(y11.sentHome.issues).toEqual(["weekday-mismatch"]);
});
test("a Year 7 report is read, and windows are sorted by year", () => {
  expect(windows.map((w) => w.yearGroup)).toEqual([7, 11, 12, 12]);
});
test("parents' evenings take their year from the term's months", () => {
  expect(eveningFor(13).date.date).toBe("2026-11-26");
  expect(eveningFor(13)).toMatchObject({ label: "Parent Meeting", term: 1 });
  expect(eveningFor(11).date.date).toBe("2026-10-29");
});
