import { buildSyntheticSchedule } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import { readAssessmentSchedule } from "./read-schedule.ts";

const year = { start: 2026, end: 2027 };
const schedule = await readAssessmentSchedule(
  await buildSyntheticSchedule(),
  year,
);

describe("the assessment schedule", () => {
  test("schedule rows read the date, topic and marks", () => {
    expect(schedule.rows).toHaveLength(2);
    expect(schedule.rows[0]).toMatchObject({
      dateText: "27 Nov",
      date: { date: "2026-11-27" },
      topicText: "Chapters 1-2",
      type: "20 mark",
      marks: 20,
    });
    expect(schedule.rows[1]).toMatchObject({
      date: { date: "2026-12-11" },
      topicText: "Chapter 3",
      marks: 12,
    });
  });

  test("a date without a year is placed in the academic year, and says so quietly", () => {
    expect(schedule.rows[0]?.date.issues).toEqual(["no-year"]);
    expect(schedule.findings).toEqual([]);
  });

  test("a date in January takes the end year", async () => {
    const jan = await readAssessmentSchedule(
      await buildSyntheticSchedule([["15 Jan", "Chapter 1", "8 mark"]]),
      year,
    );
    expect(jan.rows[0]?.date.date).toBe("2027-01-15");
  });

  test("a date that cannot be read is kept with a finding and no date", async () => {
    const odd = await readAssessmentSchedule(
      await buildSyntheticSchedule([["soon", "Chapter 1", "8 mark"]]),
      year,
    );
    expect(odd.rows[0]).toMatchObject({
      date: { date: null },
      dateText: "soon",
    });
    expect(odd.findings).toEqual([
      expect.objectContaining({ kind: "unparseable-row", severity: "warning" }),
    ]);
  });

  test("a type with no marks has marks null", async () => {
    const none = await readAssessmentSchedule(
      await buildSyntheticSchedule([["27 Nov", "Chapter 1", "Mock exam"]]),
      year,
    );
    expect(none.rows[0]).toMatchObject({ type: "Mock exam", marks: null });
  });

  test("columns are found by their headings, in any order", async () => {
    const swapped = await readAssessmentSchedule(
      await buildSyntheticSchedule(
        [["20 mark", "27 Nov", "Chapter 2"]],
        ["Type", "Date", "Topic"],
      ),
      year,
    );
    expect(swapped.rows[0]).toMatchObject({
      date: { date: "2026-11-27" },
      topicText: "Chapter 2",
      marks: 20,
    });
  });

  test("a table without a Date column is refused with a finding", async () => {
    const refused = await readAssessmentSchedule(
      await buildSyntheticSchedule([["a", "b", "c"]], ["X", "Y", "Z"]),
      year,
    );
    expect(refused.rows).toEqual([]);
    expect(refused.findings).toEqual([
      expect.objectContaining({ kind: "unreadable-table", severity: "error" }),
    ]);
  });

  test("a file that is not a Word document is refused with a finding", async () => {
    const refused = await readAssessmentSchedule(
      new Uint8Array([1, 2, 3]),
      year,
    );
    expect(refused.rows).toEqual([]);
    expect(refused.findings.map((f) => f.kind)).toEqual(["unreadable-table"]);
  });
});
