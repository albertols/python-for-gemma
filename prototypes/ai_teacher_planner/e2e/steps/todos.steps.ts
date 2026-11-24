import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const notes = (page: Page) => page.getByRole("region", { name: "To-do notes" });
const group = (page: Page, name: string) =>
  notes(page).getByRole("region", { name, exact: true });

/** The note I last added, so "I tick it" knows which one. */
const last = new WeakMap<Page, string>();

async function openToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Friday 20 November 2026",
  );
  await expect(notes(page)).toBeVisible();
}

async function addNote(page: Page, text: string, when: "Today" | "This week") {
  await openToday(page);
  const box = notes(page).getByLabel("Add a note");
  await box.fill(text);
  await notes(page).getByRole("radio", { name: when }).check();
  await notes(page).getByRole("button", { name: "Save note" }).click();
  await expect(box).toHaveValue("");
  last.set(page, text);
}

When("I add the note {string} for today", async ({ page }, text: string) => {
  await addNote(page, text, "Today");
});
When(
  "I add the note {string} for this week",
  async ({ page }, text: string) => {
    await addNote(page, text, "This week");
  },
);

Given("an undone note from 19 November 2026", async ({ request }) => {
  const res = await request.post("/api/todos", {
    data: { text: "Email the exam board", scope: "day", date: "2026-11-19" },
  });
  expect(res.status()).toBe(201);
});

Then("it shows under {string}", async ({ page }, heading: string) => {
  if (!last.has(page)) {
    await openToday(page);
    await expect(
      group(page, heading).getByText("Email the exam board"),
    ).toBeVisible();
    return;
  }
  await expect(
    group(page, heading).getByText(last.get(page) as string, { exact: true }),
  ).toBeVisible();
});

When("I tick it", async ({ page }) => {
  // Click, then wait for the tick to show: the box follows the API's answer, so check() would look too early.
  const box = notes(page).getByRole("checkbox", {
    name: last.get(page) as string,
  });
  await box.click();
  await expect(box).toBeChecked();
});

Then("it shows as done", async ({ page }) => {
  const item = notes(page)
    .getByRole("listitem")
    .filter({ hasText: last.get(page) as string });
  await expect(item).toContainText("(done)");
  await expect(item.getByText(last.get(page) as string)).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
});

When("I remove it", async ({ page }) => {
  await notes(page)
    .getByRole("button", { name: `Remove note: ${last.get(page)}` })
    .click();
});

Then("it is not listed", async ({ page }) => {
  await expect(notes(page).getByText(last.get(page) as string)).toHaveCount(0);
});
