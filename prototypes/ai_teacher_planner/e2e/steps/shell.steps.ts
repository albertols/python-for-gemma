import { expect } from "@playwright/test";
import { expectNoSeriousViolations } from "../support/axe.ts";
import { Given, Then, When } from "../support/fixtures.ts";

Given("the API does not answer", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
});

When("I open the app", async ({ page }) => {
  await page.goto("/");
});

Then(
  "I see the navigation with {string}, {string}, {string} and {string}",
  async ({ page }, a: string, b: string, c: string, d: string) => {
    const nav = page.getByRole("navigation");
    await expect(nav).toHaveCount(1);
    for (const name of [a, b, c, d])
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  },
);

Then("the page has no serious accessibility violations", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page);
});

Then("the theme is dark", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

When("I switch to the light theme and reload", async ({ page }) => {
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.reload();
});

Then("the theme is light", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

Then(
  "I see {string} and how to start it",
  async ({ page }, message: string) => {
    await expect(page.getByRole("heading", { name: message })).toBeVisible();
    await expect(page.getByText("pnpm start")).toBeVisible();
  },
);
