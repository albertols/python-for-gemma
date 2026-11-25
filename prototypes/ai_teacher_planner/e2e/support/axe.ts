import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Runs axe on the page as it is now; fails on any serious or critical violation. */
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes) ${v.help}`);
  expect(serious, serious.join("\n")).toEqual([]);
}
