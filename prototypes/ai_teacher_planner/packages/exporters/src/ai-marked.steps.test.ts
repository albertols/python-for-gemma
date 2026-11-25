import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { featureFile } from "@planner/fixtures";
import ExcelJS from "exceljs";
import { expect } from "vitest";
import type { FortnightExport } from "./model.ts";
import { aiProvenance, lesson } from "./test-data.ts";
import { exportFortnightXlsx } from "./xlsx/fortnight.ts";

const feature = await loadFeature(featureFile("13-ai-marked-reviewed"));
describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "An AI suggestion I have not reviewed is left out of an export, with a warning",
    ({ Given, When, Then, And }) => {
      let data: FortnightExport;
      let out: { file: Uint8Array; warning: string | null };
      Given("a lesson drafted by AI that I have not reviewed", () => {
        data = {
          w1: "2026-11-23",
          w2: null,
          generatedOn: "2026-11-25",
          lessons: [
            lesson({ period: 2, title: "Planned by the engine" }),
            lesson({
              period: 3,
              title: "Drafted by AI",
              provenance: aiProvenance("suggested"),
            }),
          ],
        };
      });
      When("I export the fortnight to Excel", async () => {
        out = await exportFortnightXlsx(data);
      });
      Then("the lesson is not in the workbook", async () => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(out.file as unknown as ArrayBuffer);
        const ws = wb.getWorksheet("Week 1") as ExcelJS.Worksheet;
        expect(String(ws.getCell("B3").value)).toContain(
          "Planned by the engine",
        );
        expect(ws.getCell("B4").value).toBeNull();
      });
      And("I am warned that 1 AI suggestion was left out", () => {
        expect(out.warning).toBe(
          "1 AI suggestion was left out because you have not reviewed it.",
        );
      });
    },
  );
});
