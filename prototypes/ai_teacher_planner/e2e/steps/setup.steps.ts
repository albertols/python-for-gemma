import { expect } from "@playwright/test";
import { Then, When } from "../support/fixtures.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const cell = (week: 1 | 2, day: number, period: number) =>
  `Week ${week}, ${WEEKDAYS[day - 1]}, period ${period}`;

interface Audit {
  rows: { perGroup: Record<string, { open: number }> }[];
}
/** Open lessons for a group across every teaching block, as the API counts them. */
async function auditTotal(
  request: import("@playwright/test").APIRequestContext,
  groupId: string,
): Promise<number> {
  const res = await request.get("/api/audit");
  expect(res.ok()).toBe(true);
  const audit = (await res.json()) as Audit;
  return audit.rows.reduce((n, r) => n + (r.perGroup[groupId]?.open ?? 0), 0);
}
let auditBefore = 0;

When("I import the school calendar", async ({ page }) => {
  await page.goto("/setup");
  const posted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/calendar/import") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Import the school calendar" })
    .click();
  expect((await posted).status()).toBe(200);
  await expect(page.getByText(/Imported on/)).toBeVisible();
});

Then("I see the Week 1 and Week 2 day counts", async ({ page }) => {
  await expect(page.getByText(/Week 1: \d+ days/)).toBeVisible();
  await expect(page.getByText(/Week 2: \d+ days/)).toBeVisible();
});

Then(
  "the report lists the stray {string} on 31 October 2026 as a warning",
  async ({ page }, _stray: string) => {
    const warnings = page.getByRole("region", { name: "Warnings" });
    const item = warnings.getByRole("listitem").filter({
      hasText: "31 October 2026",
    });
    await expect(item).toContainText("is not Week 1 or Week 2");
  },
);

Then(
  "the report says the wrong weekday on 11 July 2026 is outside the school year",
  async ({ page }) => {
    const outside = page
      .locator("details")
      .filter({ hasText: "Outside the school year" });
    await outside.getByText("Outside the school year").click();
    await expect(
      outside.getByRole("listitem").filter({ hasText: "11 July 2026" }).first(),
    ).toContainText("weekday does not match");
  },
);

When("I clear 11D from Week 1 Monday period 3", async ({ page, request }) => {
  auditBefore = await auditTotal(request, "11D");
  await page.goto("/setup");
  await page.getByLabel(cell(1, 1, 3), { exact: true }).selectOption("");
});

Then("the fortnight total for 11D is {int}", async ({ page }, n: number) => {
  await expect(
    page.getByRole("listitem").filter({ hasText: /^11D:/ }),
  ).toContainText(`${n} lessons`);
});

When("I save the timetable", async ({ page }) => {
  await page.getByRole("button", { name: "Save the timetable" }).click();
  await expect(page.getByText("Timetable saved.")).toBeVisible();
});

Then("the slot audit shows 11D with fewer lessons", async ({ request }) => {
  expect(await auditTotal(request, "11D")).toBeLessThan(auditBefore);
});

When("I put 13 1 where 13 5 already is and save", async ({ page }) => {
  await page.goto("/setup");
  // Week 1 Tuesday period 1 holds 13 5. A cell has one lesson control, so the
  // second occupant goes in as a duty label: the engine's one-period clash.
  await expect(page.getByLabel(cell(1, 2, 1), { exact: true })).toHaveValue(
    "13 5",
  );
  await page.getByLabel(`${cell(1, 2, 1)}, duty`, { exact: true }).fill("13 1");
  await page.getByRole("button", { name: "Save the timetable" }).click();
});

Then("I see why the timetable was not saved", async ({ page }) => {
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Nothing was saved" });
  await expect(alert).toContainText("share one period");
});

Then("the timetable is unchanged after a reload", async ({ page }) => {
  await page.reload();
  await expect(page.getByLabel(cell(1, 2, 1), { exact: true })).toHaveValue(
    "13 5",
  );
  await expect(
    page.getByLabel(`${cell(1, 2, 1)}, duty`, { exact: true }),
  ).toHaveValue("");
});

Then("I can reach every timetable cell with the keyboard", async ({ page }) => {
  await page.goto("/setup");
  const first = page.getByLabel(cell(1, 1, 1), { exact: true });
  await expect(first).toBeVisible();
  await first.focus();
  const seen = new Set<string>();
  for (let i = 0; i < 400 && seen.size < 60; i++) {
    const label = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );
    if (/^Week [12], \w+, period \d$/.test(label)) seen.add(label);
    await page.keyboard.press("Tab");
  }
  for (const week of [1, 2] as const)
    for (let day = 1; day <= 5; day++)
      for (let p = 1; p <= 6; p++) expect(seen).toContain(cell(week, day, p));
});
