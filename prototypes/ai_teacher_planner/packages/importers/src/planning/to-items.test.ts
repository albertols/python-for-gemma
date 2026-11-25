import { type CourseId, IMPORTED, type SowItem } from "@planner/domain";
import {
  buildSyntheticPlanningSheet,
  buildSyntheticSchedule,
  type SheetCell,
  SYNTHETIC_PLANNING_ROWS,
  syntheticPack,
  syntheticScheme,
} from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import { readAssessmentSchedule } from "../assessment-schedule/read-schedule.ts";
import { readPlanningSheet } from "./read-planning.ts";
import { planningToItems } from "./to-items.ts";

const COURSE: CourseId = "syn-econ";
const year = { start: 2026, end: 2027 };
const planning = await readPlanningSheet(await buildSyntheticPlanningSheet());
const scheduleOf = async (rows?: string[][]) =>
  (await readAssessmentSchedule(await buildSyntheticSchedule(rows), year)).rows;
const schedule = await scheduleOf();

const run = (over: Partial<Parameters<typeof planningToItems>[0]> = {}) =>
  planningToItems({
    courseId: COURSE,
    board: "IAL",
    planning,
    schedule,
    pack: syntheticPack(),
    today: "2026-11-09",
    ...over,
  });
const { items, findings } = run();
const item = (id: string, from: SowItem[] = items): SowItem => {
  const found = from.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};
const assessmentFor = (id: string, from: SowItem[] = items) =>
  item(id, from).assessment;

describe("planningToItems", () => {
  test("items come out in sheet order, each linked to its pack chapter, with origin import", () => {
    expect(
      items
        .filter((i) => i.kind === "teaching")
        .map((i) => [i.id, i.lessons, i.packRefs]),
    ).toEqual([
      ["ch1", 3, ["ch1"]],
      ["ch2", 4, ["ch2"]],
      ["ch3", 4, ["ch3"]],
      ["ch4", 2, ["ch4"]],
    ]);
    expect(items.every((i) => i.provenance.origin === IMPORTED.origin)).toBe(
      true,
    );
    expect(items.every((i) => i.courseId === COURSE)).toBe(true);
  });

  test("an assessment is placed after the last chapter it names, with a length from its marks", () => {
    expect(items.map((i) => i.id)).toEqual([
      "ch1",
      "ch2",
      "a-ch2",
      "ch3",
      "a-ch3",
      "ch4",
    ]);
    expect(items.map((i) => i.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(assessmentFor("a-ch2")).toMatchObject({
      date: "2026-11-27",
      marks: 20,
      durationMinutes: 30,
      slotUse: "whole",
      covers: ["ch1", "ch2"],
    });
    expect(assessmentFor("a-ch3")).toMatchObject({
      marks: 12,
      durationMinutes: 18,
      slotUse: "in-lesson",
      covers: ["ch3"],
    });
  });

  test("it produces what the synthetic scheme fixture holds", () =>
    expect(items).toEqual(syntheticScheme(COURSE)));

  test("a count note and a third-column note are kept on the item", async () => {
    expect(item("ch1").note).toBe("started last year");
    const rows: SheetCell[][] = SYNTHETIC_PLANNING_ROWS.map((r) =>
      r[0] === "1 Demand"
        ? ["1 Demand", "3 (started last year)", "Past paper Q1"]
        : r,
    );
    const both = planningToItems({
      courseId: COURSE,
      board: "IAL",
      planning: await readPlanningSheet(
        await buildSyntheticPlanningSheet(rows),
      ),
      schedule,
      pack: syntheticPack(),
      today: "2026-11-09",
    });
    expect(item("ch1", both.items).note).toBe(
      "started last year; Past paper Q1",
    );
  });

  test("a schedule row dated before today is imported as sat, so it is never moved into today's lesson", () => {
    const later = run({ today: "2026-12-01" }).items;
    expect(assessmentFor("a-ch2", later)?.status).toBe("sat");
    expect(assessmentFor("a-ch3", later)?.status).toBe("planned");
    expect(assessmentFor("a-ch2")?.status).toBe("planned");
    // today itself is not yet past
    expect(
      assessmentFor("a-ch2", run({ today: "2026-11-27" }).items)?.status,
    ).toBe("planned");
  });

  test("a schedule row that says 'whole lesson' or 'in lesson' wins over defaultSlotUse", async () => {
    const rows = await scheduleOf([
      ["27 Nov", "Chapter 2", "20 mark, in lesson"],
      ["11 Dec", "Chapter 3", "12 mark - whole lesson"],
    ]);
    const forced = run({ schedule: rows }).items;
    expect(assessmentFor("a-ch2", forced)?.slotUse).toBe("in-lesson");
    expect(assessmentFor("a-ch3", forced)?.slotUse).toBe("whole");
  });

  test("a board without a marks rule has no length, and takes a whole lesson", () => {
    const ib = run({ board: "IB" }).items;
    expect(assessmentFor("a-ch2", ib)).toMatchObject({
      marks: 20,
      durationMinutes: null,
      slotUse: "whole",
    });
  });

  test("a chapter the pack does not have is imported unlinked, with a finding", async () => {
    const pack = syntheticPack();
    const smaller = {
      ...pack,
      chapters: pack.chapters.filter((c) => c.id !== "ch4"),
    };
    const out = run({ pack: smaller });
    expect(item("ch4", out.items)).toMatchObject({ packRefs: [], lessons: 2 });
    expect(out.findings).toContainEqual(
      expect.objectContaining({ kind: "unlinked-chapter", sheetRow: 7 }),
    );
    expect(findings.filter((f) => f.kind === "unlinked-chapter")).toEqual([]);
  });

  test("importing again keeps item ids, so pins and overrides still point at them", async () => {
    const again = run({ schedule: await scheduleOf() });
    expect(again.items.map((i) => i.id)).toEqual(items.map((i) => i.id));
    // a chapter inserted mid-sheet and two chapters reordered: ids follow the chapters, not their position
    const rows: SheetCell[][] = [
      ["Part A (7 classes)", null],
      ["1 Demand", "3 (started last year)"],
      ["2 Supply", 4],
      ["5 Costs", 1],
      ["Part B (6 classes)", null],
      ["4 Prices", 2],
      ["3 Markets", 4],
    ];
    const moved = run({
      planning: await readPlanningSheet(
        await buildSyntheticPlanningSheet(rows),
      ),
    });
    expect(moved.items.map((i) => i.id)).toEqual([
      "ch1",
      "ch2",
      "a-ch2",
      "ch5",
      "ch4",
      "ch3",
      "a-ch3",
    ]);
    expect(item("ch3", moved.items)).toMatchObject({
      title: "Markets",
      lessons: 4,
      packRefs: ["ch3"],
    });
    expect(item("ch4", moved.items)).toMatchObject({
      title: "Prices",
      lessons: 2,
    });
    expect(assessmentFor("a-ch3", moved.items)?.covers).toEqual(["ch3"]);
  });

  test("two assessments after the same chapter get different ids, in schedule order", async () => {
    const rows = await scheduleOf([
      ["27 Nov", "Chapter 2", "20 mark"],
      ["4 Dec", "Chapter 2", "10 mark"],
    ]);
    const out = run({ schedule: rows }).items;
    expect(out.map((i) => i.id).slice(0, 5)).toEqual([
      "ch1",
      "ch2",
      "a-ch2",
      "a-ch2-2",
      "ch3",
    ]);
  });

  test("a schedule row that names no chapter of the sheet is left out, with a finding", async () => {
    const rows = await scheduleOf([
      ["27 Nov", "Chapter 9", "20 mark"],
      ["4 Dec", "Revision", "10 mark"],
    ]);
    const out = run({ schedule: rows });
    expect(out.items.filter((i) => i.kind === "assessment")).toEqual([]);
    expect(
      out.findings.filter((f) => f.kind === "unparseable-row"),
    ).toHaveLength(2);
  });

  test("a chapter the schedule names but the sheet lacks is dropped from covers, with a finding", async () => {
    const rows = await scheduleOf([["27 Nov", "Chapters 2-3, 9", "20 mark"]]);
    const out = run({ schedule: rows });
    expect(assessmentFor("a-ch3", out.items)?.covers).toEqual(["ch2", "ch3"]);
    expect(
      out.findings.filter((f) => f.kind === "unparseable-row"),
    ).toHaveLength(1);
  });

  test("a row with no date is imported undated and planned", async () => {
    const rows = await scheduleOf([["tbc", "Chapter 2", "20 mark"]]);
    const spec = assessmentFor(
      "a-ch2",
      run({ schedule: rows, today: "2027-01-01" }).items,
    );
    expect(spec).toMatchObject({ date: null, status: "planned" });
  });

  test("a chapter with no count is imported with no lessons and its finding stays with the sheet", async () => {
    const rows: SheetCell[][] = SYNTHETIC_PLANNING_ROWS.map((r) =>
      r[0] === "2 Supply" ? ["2 Supply", "TBC"] : r,
    );
    const out = run({
      planning: await readPlanningSheet(
        await buildSyntheticPlanningSheet(rows),
      ),
    });
    expect(item("ch2", out.items).lessons).toBe(0);
  });
});
