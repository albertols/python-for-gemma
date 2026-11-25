import { syntheticScannedPdf, syntheticSpecPdf } from "@planner/fixtures";
import { describe, expect, test } from "vitest";
import { extractPdfText } from "./pdf-text.ts";

describe("extractPdfText", () => {
  test("text comes out page by page, in reading order", async () => {
    const { pages } = await extractPdfText(syntheticSpecPdf());
    expect(pages.map((p) => p.number)).toEqual([1, 2]);
    const [one, two] = pages.map((p) => p.text);
    expect(one).toContain("1.1 Demand and the demand curve");
    // lines keep the order they were written in
    const at = (s: string) => one?.indexOf(s) ?? -1;
    expect(at("1.1 Demand")).toBeGreaterThan(-1);
    expect(at("1.2 Supply")).toBeGreaterThan(at("1.1 Demand"));
    expect(at("1.3 Price")).toBeGreaterThan(at("1.2 Supply"));
    expect(one).not.toContain("1.4");
    expect(two).toContain("1.4 Elasticity of demand (higher level only)");
    expect(two?.indexOf("1.4")).toBeLessThan(two?.indexOf("2.1") ?? -1);
  });

  test("a PDF with no text layer gives pages with empty text, not an error", async () => {
    const { pages } = await extractPdfText(syntheticScannedPdf());
    expect(pages).toEqual([{ number: 1, text: "" }]);
  });

  test("bytes that are not a PDF are an error with a sentence she can read", async () => {
    await expect(
      extractPdfText(new TextEncoder().encode("not a pdf")),
    ).rejects.toThrow(/PDF/);
  });
});
