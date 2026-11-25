import { readAssessmentSchedule, readPlanningSheet } from "@planner/importers";
import { describe, expect, test } from "vitest";
import { loadConfig } from "../config.ts";
import { createResourceGateway } from "../gateway/resource-gateway.ts";

// Runs only where her planning folder is on disk (never in CI). Her files are
// read through the gateway and nothing else; this test asserts and prints
// counts and numbers, never a cell, a chapter title or a file name.
const gateway = createResourceGateway(
  loadConfig({ PLANNER_DATA_DIR: "/unused" }).resourcesDir,
);
const files = await gateway.find("planning-files").catch(() => []);
const ext = (name: string, e: string) => name.toLowerCase().endsWith(e);

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Her IAL Unit 4 sheet is the IAL sheet whose chapters run from 22.
const ial = await Promise.all(
  files
    .filter((f) => f.toLowerCase().startsWith("ial/") && ext(f, ".xlsx"))
    .map(async (f) => readPlanningSheet(await gateway.read(f))),
);
const sheets = ial.filter((p) => p.rows.some((r) => r.number === "22"));
const imp = sheets[0];

describe.skipIf(files.length === 0)("her real IAL planning sheet", () => {
  test("exactly one IAL sheet starts at chapter 22", () => {
    console.info(
      `planning files ${files.length}, IAL sheets read ${ial.length}, starting at 22: ${sheets.length}`,
    );
    expect(sheets.length, "the number of IAL sheets starting at 22").toBe(1);
  });

  test("sixteen chapters, 22 to 37, summing to 70, with a stated total of 65", () => {
    const chapters = (imp?.rows ?? []).filter((r) => r.kind === "chapter");
    console.info(
      `rows ${imp?.rows.length}, chapters ${chapters.length}, sum ${imp?.sum}, stated total ${imp?.statedTotal}, findings ${imp?.findings.length}`,
    );
    expect(chapters.map((c) => c.number)).toEqual(range(22, 37).map(String));
    expect(imp?.sum).toBe(70);
    expect(imp?.statedTotal).toBe(65);
    expect(
      chapters.find((c) => c.number === "22")?.countNote === "started in Y12",
      "chapter 22's count note is not the expected one",
    ).toBe(true);
  });

  test("the difference between the two totals is said, and no count is missing", () => {
    const kinds = (imp?.findings ?? []).map((f) => f.kind);
    console.info(
      `findings by kind: total ${kinds.filter((k) => k === "total-mismatch").length}, section ${kinds.filter((k) => k === "section-total-mismatch").length}, missing count ${kinds.filter((k) => k === "missing-count").length}`,
    );
    expect(kinds).toContain("total-mismatch");
    expect(kinds).not.toContain("missing-count");
  });

  test("the chapters with a count note, and the sections, are counted", () => {
    const rows = imp?.rows ?? [];
    console.info(
      `sections ${rows.filter((r) => r.kind === "section").length}, notes ${rows.filter((r) => r.countNote !== null).length}, exam-practice notes ${rows.filter((r) => r.extra !== null).length}`,
    );
    expect(rows.filter((r) => r.countNote !== null).length).toBeGreaterThan(0);
  });

  test("an assessment schedule among her Word files reads with dated rows, counted", async () => {
    const docs = files.filter((f) => ext(f, ".docx"));
    const read = await Promise.all(
      docs.map(async (f) =>
        readAssessmentSchedule(await gateway.read(f), {
          start: 2026,
          end: 2027,
        }),
      ),
    );
    const schedules = read.filter((r) => r.rows.length > 0);
    console.info(
      `Word files ${docs.length}, read as schedules ${schedules.length}, not schedules (refused) ${read.length - schedules.length}, rows ${schedules.reduce((n, r) => n + r.rows.length, 0)}, dated ${schedules.reduce((n, r) => n + r.rows.filter((x) => x.date.date !== null).length, 0)}, with marks ${schedules.reduce((n, r) => n + r.rows.filter((x) => x.marks !== null).length, 0)}`,
    );
    // Her other Word files (unit plans) have no date column and are refused, not guessed at.
    expect(schedules.length).toBeGreaterThan(0);
    for (const r of read.filter((x) => x.rows.length === 0))
      expect(r.findings.map((f) => f.kind)).toEqual(["unreadable-table"]);
  });
});
