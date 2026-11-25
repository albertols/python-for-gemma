import ExcelJS from "exceljs";
import fc from "fast-check";
import { expect, test } from "vitest";
import type { ExportLesson, FortnightExport } from "../model.ts";
import {
  aiProvenance,
  doublePair,
  lesson,
  WEEK_OF_23_NOV,
} from "../test-data.ts";
import { exportFortnightXlsx, textCell } from "./fortnight.ts";

const base: FortnightExport = {
  w1: "2026-11-23",
  w2: "2026-11-30",
  lessons: WEEK_OF_23_NOV,
  generatedOn: "2026-11-25",
};
const read = async (data: FortnightExport) => {
  const { file, warning } = await exportFortnightXlsx(data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  return { wb, warning };
};
const text = (ws: ExcelJS.Worksheet, address: string) =>
  String(ws.getCell(address).value);

test("the workbook has Week 1 and Week 2 sheets laid out like her timetable", async () => {
  const { wb, warning } = await read(base);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Week 1", "Week 2"]);
  const w1 = wb.getWorksheet("Week 1");
  if (!w1) throw new Error("no Week 1");
  // header row: Mon to Fri with their dates
  expect(
    [1, 2, 3, 4, 5, 6].map((c) => String(w1.getRow(1).getCell(c).value)),
  ).toEqual([
    "",
    "Mon 23 Nov",
    "Tue 24 Nov",
    "Wed 25 Nov",
    "Thu 26 Nov",
    "Fri 27 Nov",
  ]);
  // rows P1 to P6
  expect([2, 3, 4, 5, 6, 7].map((r) => String(w1.getCell(r, 1).value))).toEqual(
    ["P1", "P2", "P3", "P4", "P5", "P6"],
  );
  // Friday P6 holds the group and the lesson title
  expect(text(w1, "F7")).toBe("13 1\nAssessment: Chapters 1-2");
  expect(text(w1, "B6")).toBe("13 1\n2 Supply (3 of 4)");
  expect(text(w1, "D3")).toBe("13 1\n2 Supply (4 of 4)");
  // nothing else in the grid
  expect(w1.getCell("C2").value).toBeNull();
  expect(warning).toBeNull();
});

test("Week 2 has its own dates and its own lessons", async () => {
  const { wb } = await read({
    ...base,
    lessons: [lesson({ date: "2026-12-01", period: 3, title: "In week two" })],
  });
  const w2 = wb.getWorksheet("Week 2");
  expect(String(w2?.getCell("B1").value)).toBe("Mon 30 Nov");
  expect(text(w2 as ExcelJS.Worksheet, "C4")).toBe("13 1\nIn week two");
  expect(wb.getWorksheet("Week 1")?.getCell("C4").value).toBeNull();
});

test("a fortnight with only one week has only that sheet", async () => {
  const { wb } = await read({ ...base, w2: null });
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Week 1"]);
});

test("a room and a state other than planned are shown in the cell", async () => {
  const { wb } = await read({
    ...base,
    lessons: [
      lesson({ period: 1, room: "S12", state: "taught", title: "T" }),
      lesson({ period: 3, state: "assumed", title: "A" }),
      lesson({ period: 5, state: "cover", title: "C" }),
    ],
  });
  const w1 = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(text(w1, "B2")).toBe("13 1\nT\nRoom S12\nTaught");
  expect(text(w1, "B4")).toBe("13 1\nA\nAssumed, not confirmed");
  expect(text(w1, "B6")).toBe("13 1\nC\nCover");
});

test("a double period from the timetable is one merged cell", async () => {
  const { wb } = await read({
    ...base,
    lessons: [
      ...doublePair({ groupId: "13 3", date: "2026-11-24", room: "S12" }, 3, [
        "Ch 1 (1 of 2)",
        "Ch 1 (2 of 2)",
      ]),
      lesson({
        groupId: "13 1",
        date: "2026-11-25",
        period: 3,
        title: "Single",
      }),
    ],
  });
  const w1 = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(w1.model.merges).toEqual(["C4:C5"]);
  expect(text(w1, "C4")).toBe("13 3\nCh 1 (1 of 2)\nCh 1 (2 of 2)\nRoom S12");
  expect(w1.getCell("C5").isMerged).toBe(true);
  expect(w1.getCell("C5").master.address).toBe("C4");
  expect(w1.getCell("D4").isMerged).toBe(false);
});

test("two single lessons on neighbouring periods (P2 and P3) stay two cells", async () => {
  const { wb } = await read({
    ...base,
    lessons: [
      lesson({ period: 2, title: "Second" }),
      lesson({ period: 3, title: "Third" }),
    ],
  });
  const w1 = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(w1.model.merges).toEqual([]);
  expect(text(w1, "B3")).toBe("13 1\nSecond");
  expect(text(w1, "B4")).toBe("13 1\nThird");
});

test("a run on P1, P2 and P3 writes all three lessons; only the timetable's double is merged", async () => {
  const { wb } = await read({
    ...base,
    lessons: [
      ...doublePair({}, 1, ["One", "Two"]),
      lesson({ period: 3, title: "Three" }),
    ],
  });
  const w1 = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(w1.model.merges).toEqual(["B2:B3"]);
  expect(text(w1, "B2")).toBe("13 1\nOne\nTwo");
  expect(text(w1, "B4")).toBe("13 1\nThree");
  // and with no double at all, the same run is three cells
  const flat = await read({
    ...base,
    lessons: [1, 2, 3].map((p) =>
      lesson({ period: p as 1 | 2 | 3, title: `L${p}` }),
    ),
  });
  const f1 = flat.wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(f1.model.merges).toEqual([]);
  expect([text(f1, "B2"), text(f1, "B3"), text(f1, "B4")]).toEqual([
    "13 1\nL1",
    "13 1\nL2",
    "13 1\nL3",
  ]);
});

test("a double whose other half has no lesson is a single cell", async () => {
  const { wb } = await read({
    ...base,
    lessons: [lesson({ period: 3, doubleWith: 4, title: "Alone" })],
  });
  const w1 = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(w1.model.merges).toEqual([]);
  expect(text(w1, "B4")).toBe("13 1\nAlone");
});

test("every lesson appears in the workbook exactly once, whatever the periods and doubles", () =>
  fc.assert(
    fc.asyncProperty(
      // for each day Mon-Fri and period, whether a lesson is there; and for each
      // pair (P1+2, P3+4, P5+6) whether the timetable makes it a double
      fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }),
      fc.array(fc.boolean(), { minLength: 15, maxLength: 15 }),
      async (present, doubles) => {
        const lessons: ExportLesson[] = [];
        for (let day = 0; day < 5; day++)
          for (let p = 1; p <= 6; p++) {
            if (!present[day * 6 + p - 1]) continue;
            const first = p % 2 === 1;
            const isDouble = doubles[day * 3 + Math.floor((p - 1) / 2)];
            lessons.push(
              lesson({
                date: `2026-11-${23 + day}`,
                period: p as 1,
                doubleWith: isDouble ? ((first ? p + 1 : p - 1) as 2) : null,
                title: `T${day}-${p}`,
              }),
            );
          }
        const { wb } = await read({ ...base, w2: null, lessons });
        const all: string[] = [];
        for (const ws of wb.worksheets)
          ws.eachRow((row) => {
            row.eachCell((cell) => {
              if (cell.address === cell.master.address)
                all.push(String(cell.value));
            });
          });
        for (const l of lessons)
          expect(
            all.filter((t) => t.split("\n").includes(l.title)),
          ).toHaveLength(1);
      },
    ),
    { numRuns: 100 },
  ));

test("the last row of each sheet holds the AI statement when there is one", async () => {
  const { wb, warning } = await read({
    ...base,
    lessons: [
      ...WEEK_OF_23_NOV,
      lesson({
        period: 1,
        title: "Drafted",
        provenance: aiProvenance("accepted"),
      }),
    ],
  });
  for (const ws of wb.worksheets) {
    expect(String(ws.lastRow?.getCell(1).value)).toBe(
      "1 item was drafted by AI and reviewed on 2026-11-24.",
    );
  }
  expect(warning).toBeNull();
});

test("with no AI items the last row is the grid and there is no statement", async () => {
  const { wb } = await read(base);
  expect(wb.getWorksheet("Week 1")?.lastRow?.number).toBe(7);
});

test("an AI lesson she has not reviewed is left out of the grid and counted in the warning", async () => {
  const { wb, warning } = await read({
    ...base,
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
  const w1 = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
  expect(w1.getCell("B2").value).toBeNull();
  expect(w1.getCell("B3").value).toBeNull();
  expect(warning).toBe(
    "2 AI suggestions were left out because you have not reviewed them. 1 rejected AI suggestion was left out.",
  );
  expect(wb.description).toBe(warning);
});

test("a lesson title that looks like a formula is written as text, never as a formula", async () => {
  const evil = '=HYPERLINK("http://example.invalid","click")';
  const { wb } = await read({
    ...base,
    lessons: [lesson({ title: evil })],
  });
  const cell = (wb.getWorksheet("Week 1") as ExcelJS.Worksheet).getCell("B6");
  expect(cell.type).toBe(ExcelJS.ValueType.String);
  expect(cell.value).toBe(`13 1\n${evil}`);
  expect(cell.formula).toBeUndefined();
});

test.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])(
  "text that starts with %j is stored as a string in a text-format cell",
  async (value) => {
    const ws = new ExcelJS.Workbook().addWorksheet("t");
    const cell = ws.getCell("A1");
    textCell(cell, value);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe(value);
    expect(cell.numFmt).toBe("@");
  },
);
