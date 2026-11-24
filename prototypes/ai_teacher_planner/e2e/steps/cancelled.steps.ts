import { expect, type Page } from "@playwright/test";
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
/** "24 November 2026" as "2026-11-24". */
const isoOf = (d: number, month: string, y: number) =>
  `${y}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const dialog = (page: Page) => page.getByRole("dialog");

/** How many lessons the dialog listed, kept for the step that checks it after the click. */
const listed = new WeakMap<Page, number>();

async function openDialog(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Friday 20 November 2026",
  );
  await page.getByRole("button", { name: "Lessons were cancelled" }).click();
  await expect(dialog(page)).toBeVisible();
}

async function setDates(page: Page, iso: string) {
  await dialog(page).getByLabel("From").fill(iso);
  await dialog(page).getByLabel("To").fill(iso);
}

async function record(
  page: Page,
  group: string,
  period: number,
  iso: string,
  reason: string,
) {
  await openDialog(page);
  const d = dialog(page);
  await d.getByLabel("Chosen groups").check();
  await d.getByLabel(group, { exact: true }).check();
  await setDates(page, iso);
  await d.getByLabel("Chosen periods").check();
  await d.getByLabel(`Period ${period}`).check();
  await d.getByLabel("Reason").fill(reason);
  const count = d.getByText(/^\d+ lessons?$/);
  await expect(count).toBeVisible();
  listed.set(page, Number((await count.textContent())?.split(" ")[0]));
  await d.getByRole("button", { name: "Cancel these lessons" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("status")).toContainText("cancelled.");
}

const recordSteps = async (
  { page }: { page: Page },
  group: string,
  period: number,
  d: number,
  month: string,
  y: number,
  reason: string,
) => record(page, group.replace(/'s$/, ""), period, isoOf(d, month, y), reason);

When(
  "I record that {word} period {int} on {int} {word} {int} was cancelled for {string}",
  recordSteps,
);
Given(
  "I have recorded that {word} period {int} on {int} {word} {int} was cancelled for {string}",
  recordSteps,
);

Then(
  "the dialog listed {int} lesson before I confirmed",
  async ({ page }, n: number) => {
    expect(listed.get(page)).toBe(n);
  },
);

When("I open the cancel dialog", async ({ page }) => openDialog(page));

When("I open Setup", async ({ page }) => {
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Lessons you cancelled" }),
  ).toBeVisible();
});

When("I remove {string} in Setup", async ({ page }, reason: string) => {
  await page.goto("/setup");
  const item = page.getByRole("listitem").filter({ hasText: reason });
  await expect(item).toContainText("1 lesson");
  await item.getByRole("button", { name: "Remove" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Removed" }),
  ).toBeVisible();
});

When(
  "I try to cancel lessons on {int} {word} {int} for {string}",
  async ({ page }, d: number, month: string, y: number, reason: string) => {
    await openDialog(page);
    await setDates(page, isoOf(d, month, y));
    await dialog(page).getByLabel("Reason").fill(reason);
    await expect(dialog(page)).toContainText("No lessons fall in these dates");
    // With no lesson to cancel the button is off, so nothing can be sent.
    await expect(
      dialog(page).getByRole("button", { name: "Cancel these lessons" }),
    ).toBeDisabled();
  },
);

Then(
  "I see {string} in the dialog and nothing is stored",
  async ({ page, request }, text: string) => {
    await expect(dialog(page)).toContainText(text);
    await expect(dialog(page)).toBeVisible();
    expect(await (await request.get("/api/disruptions")).json()).toEqual([]);
  },
);

/** The board cell of one lesson, on the fortnight holding its date. */
async function cellOf(page: Page, group: string, period: number, iso: string) {
  await page.goto(`/board?w1=${iso}`);
  await expect(page.getByRole("table").first()).toBeVisible();
  return page
    .locator(
      `td[data-kind="lesson"][data-date="${iso}"][data-period="${period}"]`,
    )
    .filter({ hasText: group.replace(/'s$/, "") });
}

Then(
  "the board shows {word} period {int} on {int} {word} {int} as cancelled with {string}",
  async (
    { page },
    group: string,
    period: number,
    d: number,
    month: string,
    y: number,
    reason: string,
  ) => {
    const cell = await cellOf(page, group, period, isoOf(d, month, y));
    await expect(cell).toHaveAttribute("aria-label", /, cancelled: /);
    await expect(cell).toHaveAttribute(
      "aria-label",
      new RegExp(
        `cancelled: ${reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      ),
    );
    // The words are on the page as text: nothing was turned into markup.
    await expect(cell).toContainText(reason);
    await expect(cell.locator("b")).toHaveCount(0);
  },
);

Then(
  "the board shows {word} period {int} on {int} {word} {int} as a lesson again",
  async (
    { page },
    group: string,
    period: number,
    d: number,
    month: string,
    y: number,
  ) => {
    const cell = await cellOf(page, group, period, isoOf(d, month, y));
    await expect(cell).toHaveCount(1);
    await expect(cell).not.toHaveAttribute("aria-label", /cancelled/);
  },
);

Then(
  "the slot audit counts {int} cancelled lesson for {word} in that half-term",
  async ({ page, request }, n: number, group: string) => {
    const audit = (await (await request.get("/api/audit")).json()) as {
      rows: {
        block: { from: string; to: string };
        perGroup: Record<string, { cancelled: number }>;
      }[];
    };
    const at = audit.rows.findIndex(
      (r) => r.block.from <= "2026-11-24" && "2026-11-24" <= r.block.to,
    );
    expect(at).toBeGreaterThanOrEqual(0);
    expect(audit.rows[at]?.perGroup[group]?.cancelled).toBe(n);

    await page.goto("/audit");
    const table = page.getByRole("table", { name: /lessons per group/i });
    const headers = await table.locator("thead th").allTextContents();
    const column = headers.indexOf(group) - 1;
    expect(column).toBeGreaterThanOrEqual(0);
    await expect(
      table.locator("tbody tr").nth(at).locator("td").nth(column),
    ).toContainText(`(${n} lost)`);
  },
);
