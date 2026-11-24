import { expect, type Page } from "@playwright/test";
import { Then, When } from "../support/fixtures.ts";

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
const isoOf = (d: number, month: string, y: number) =>
  `${y}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const longOf = (d: number, month: string, y: number) => `${d} ${month} ${y}`;

const warnings = (page: Page) => page.getByRole("region", { name: "Warnings" });
/** The warning that names the date, as a list item of the report. */
const warningOn = (page: Page, when: string) =>
  warnings(page).getByRole("listitem").filter({ hasText: when });

When("I import the synthetic calendar", async ({ page }) => {
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

When(
  "I start choosing {string} for {int} {word} {int}",
  async ({ page }, button: string, d: number, month: string, y: number) => {
    const item = warningOn(page, longOf(d, month, y));
    await item.getByRole("button", { name: button }).click();
    await expect(item.getByLabel("Reason (optional)")).toBeVisible();
  },
);

When(
  "I choose {string} for {int} {word} {int} with the reason {string}",
  async (
    { page },
    button: string,
    d: number,
    month: string,
    y: number,
    reason: string,
  ) => {
    const item = warningOn(page, longOf(d, month, y));
    await item.getByRole("button", { name: button }).click();
    await item.getByLabel("Reason (optional)").fill(reason);
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes("/api/calendar/corrections/resolutions/") &&
        r.request().method() === "PUT",
    );
    await item.getByRole("button", { name: "Confirm no lessons" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("no lessons");
    // The warning has moved to Resolved.
    await expect(warningOn(page, longOf(d, month, y))).toHaveCount(0);
  },
);

When(
  "I undo the decision for {int} {word} {int}",
  async ({ page }, d: number, month: string, y: number) => {
    await page
      .getByRole("button", { name: `Undo: ${longOf(d, month, y)}` })
      .click();
    await expect(page.getByRole("status")).toContainText("undone");
  },
);

Then(
  "the slot audit lists {int} {word} {int} lessons as cancelled with {string}",
  async ({ page }, d: number, month: string, y: number, reason: string) => {
    await page.goto("/audit");
    const lost = page
      .getByRole("listitem")
      .filter({ hasText: longOf(d, month, y) })
      .filter({ hasText: reason });
    await expect(lost.first()).toContainText(reason);
    // Every group has lessons that day, and each one is listed.
    const slots = (await (
      await page.request.get(
        `/api/slots?from=${isoOf(d, month, y)}&to=${isoOf(d, month, y)}`,
      )
    ).json()) as { status: string }[];
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.status === "cancelled")).toBe(true);
    await expect(lost).toHaveCount(slots.length);
  },
);

Then(
  "the slot audit lists no lessons on {int} {word} {int} as cancelled",
  async ({ page }, d: number, month: string, y: number) => {
    await page.goto("/audit");
    await expect(
      page.getByRole("heading", { name: "Cancelled lessons" }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: longOf(d, month, y) }),
    ).toHaveCount(0);
    const slots = (await (
      await page.request.get(
        `/api/slots?from=${isoOf(d, month, y)}&to=${isoOf(d, month, y)}`,
      )
    ).json()) as { status: string }[];
    expect(slots.every((s) => s.status === "open")).toBe(true);
  },
);

When(
  "I change the week label of {int} {word} {int} to Week {int}",
  async ({ page }, d: number, month: string, y: number, week: number) => {
    const item = warningOn(page, longOf(d, month, y));
    await item.getByRole("button", { name: "Change week label" }).click();
    await item
      .getByLabel("Week label", { exact: true })
      .selectOption(`W${week}`);
    await item.getByRole("button", { name: "Save week label" }).click();
    await expect(page.getByRole("status")).toContainText(`now Week ${week}`);
  },
);

Then(
  "the board shows {int} {word} {int} as Week {int}, marked corrected",
  async ({ page }, d: number, month: string, y: number, week: number) => {
    await page.goto(`/board?w1=${isoOf(d, month, y)}`);
    await expect(page.getByRole("table").first()).toBeVisible();
    const side = page.getByRole("region", {
      name: new RegExp(`^Week ${week}`),
    });
    const header = side
      .getByRole("columnheader")
      .filter({ hasText: `${d} ${month.slice(0, 3)}` });
    await expect(header).toContainText("corrected");
    // The day's lessons are those of Week 1's timetable.
    const lessons = side.locator(
      `td[data-kind="lesson"][data-date="${isoOf(d, month, y)}"]`,
    );
    await expect(lessons.first()).toBeVisible();
  },
);

Then(
  "the import report shows one line {string} and no warning dated in August",
  async ({ page }, _line: string) => {
    const folds = page
      .locator("details")
      .filter({ hasText: "Outside the school year" });
    await expect(folds).toHaveCount(1);
    await expect(folds.locator("summary")).toContainText(
      /Outside the school year: \d+ notes \(not needed for planning\)/,
    );
    await expect(warnings(page).getByText(/August 2026/)).toHaveCount(0);
  },
);

When("I open the notes outside the school year", async ({ page }) => {
  await page.getByText(/^Outside the school year/).click();
  await expect(page.getByText(/weekday does not match/)).toBeVisible();
});
