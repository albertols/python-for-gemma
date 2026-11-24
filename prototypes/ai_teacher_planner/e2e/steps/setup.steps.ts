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
    page
      .getByRole("listitem")
      .filter({ hasText: new RegExp(`^11D: ${n} lessons`) }),
  ).toBeVisible();
});

When("I save the timetable", async ({ page }) => {
  await page.getByRole("button", { name: "Save the timetable" }).click();
  await expect(page.getByText("Timetable saved.")).toBeVisible();
  // The save refetches the timetable; the message must outlive that refetch.
  await expect(
    page.getByRole("listitem").filter({ hasText: /^11D: 4 lessons/ }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Timetable saved.")).toBeVisible();
});

Then("the slot audit shows 11D with fewer lessons", async ({ request }) => {
  expect(await auditTotal(request, "11D")).toBeLessThan(auditBefore);
});

When(
  "I put the duty 400 in the period where 13 5 already is and save",
  async ({ page }) => {
    await page.goto("/setup");
    // Week 1 Tuesday period 1 holds 13 5; a duty label in the same cell is a clash.
    await expect(page.getByLabel(cell(1, 2, 1), { exact: true })).toHaveValue(
      "13 5",
    );
    await page
      .getByLabel(`${cell(1, 2, 1)}, duty`, { exact: true })
      .fill("400");
    await page.getByRole("button", { name: "Save the timetable" }).click();
  },
);

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

When("I save the terms without changing them", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByLabel("T1 first pupil day")).not.toHaveValue("");
  await page.getByRole("button", { name: "Save the terms" }).click();
});

Then("I am told the terms were saved", async ({ page }) => {
  await expect(page.getByText("Terms saved.")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Terms saved.")).toBeVisible();
});

When("I open the outside the school year notes", async ({ page }) => {
  await page.getByText(/^Outside the school year/).click();
  await expect(page.getByText(/weekday does not match/)).toBeVisible();
});

When("I correct the Year 7 report date", async ({ page }) => {
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "Year 7 Report 1: Short" });
  await row.getByLabel(/^Date for Year 7/).fill("2027-03-10");
  await row.getByRole("button", { name: "Save this date" }).click();
});

Then("the Year 7 report date no longer needs checking", async ({ page }) => {
  await expect(page.getByText("Date saved.")).toBeVisible();
  await expect(
    page.getByText(/Year 7 Report 1: Short.*the sheet says/),
  ).toHaveCount(0);
  // The other unreadable date is still listed.
  await expect(
    page.getByText(/Year 11 Parent Meeting.*the sheet says/),
  ).toBeVisible();
});

Then("focus is on the report dates heading", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Report dates to check" }),
  ).toBeFocused();
});

When("I open the setup screen", async ({ page }) => {
  await page.goto("/setup");
});
