import { expect } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

When("I show only {int} {int} on the board", async ({ page }, a, b) => {
  await page.getByRole("button", { name: `${a} ${b}`, exact: true }).click();
  await expect(
    page.getByRole("button", { name: `${a} ${b}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

Then("every lesson on the board is {int} {int}", async ({ page }, a, b) => {
  const names = await page
    .locator('td[data-kind="lesson"]')
    .evaluateAll((cells) =>
      cells.map((c) => (c.getAttribute("aria-label") ?? "").split(", ")[0]),
    );
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((n) => n === `${a} ${b}`)).toBe(true);
});

Then("the address keeps the filter after a reload", async ({ page }) => {
  await expect(page).toHaveURL(/groups=13/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "13 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const names = await page
    .locator('td[data-kind="lesson"]')
    .evaluateAll((cells) =>
      cells.map((c) => (c.getAttribute("aria-label") ?? "").split(", ")[0]),
    );
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((n) => n === "13 1")).toBe(true);
});

When("I switch the board to Week", async ({ page }) => {
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
});

Then(
  "I see one week, and {string} moves by seven days",
  async ({ page }, next: string) => {
    const regions = page.getByRole("region", { name: /^Week \d/ });
    await expect(regions).toHaveCount(1);
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(regions).toContainText("Monday 16 November 2026");
    await expect(page.getByRole("columnheader")).toHaveCount(6);
    await page.getByRole("button", { name: next, exact: true }).click();
    await expect(page).toHaveURL(/w1=2026-11-23/);
    await expect(page.getByRole("region", { name: /^Week \d/ })).toContainText(
      "Monday 23 November 2026",
    );
    await expect(page.getByRole("table")).toHaveCount(1);
  },
);

When("I open the board on {int} {word} {int}", async ({ page }, d, m, y) => {
  const month = String(MONTHS.indexOf(m) + 1).padStart(2, "0");
  await page.goto(`/board?w1=${y}-${month}-${String(d).padStart(2, "0")}`);
  await expect(page.getByRole("table").first()).toBeVisible();
});

Then("that day says {string}", async ({ page }, text: string) => {
  // Only the last day of the term carries it in this fortnight.
  const marked = page.getByRole("columnheader").filter({ hasText: text });
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText("22 Dec");
});

Given(
  "the planner says today is Tuesday 22 December 2026, the last day before the holiday",
  async ({ page }) => {
    await page.route("**/api/today", (route) =>
      route.fulfill({
        json: {
          date: "2026-12-22",
          kind: "pupil",
          weekLabel: "W2",
          lessons: [],
          reminders: [],
          nextTeachingDay: "2027-01-08",
        },
      }),
    );
  },
);

When("I open Today", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "22 December 2026",
  );
});

Then("Today says {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});
