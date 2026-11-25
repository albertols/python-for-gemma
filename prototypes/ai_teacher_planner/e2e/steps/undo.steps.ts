// The browser steps of features/08-undo.feature (spec section 17, scenario 8).
import { expect } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";
import {
  boardCells,
  cancelDay,
  PINNED_TODAY,
  planStatus,
  proposalDialog,
  resetTo,
  SEED_HEAD,
} from "../support/plan.ts";

/** The board as it was before the reflow was accepted. */
let before: string[] = [];
let reflowLabel = "";

Given("I accepted a reflow", async ({ page, request }) => {
  await resetTo(request, "m2-planned");
  // a fact: 13 1's lessons on Monday 23 November were cancelled
  await cancelDay(request, "13 1", "2026-11-23");
  await page.goto("/board");
  await expect(
    page.getByRole("region", { name: "The plan is out of date" }),
  ).toBeVisible();
  before = await boardCells(page);
  await page.getByRole("button", { name: "See what changes" }).click();
  const dialog = proposalDialog(page);
  await expect(dialog).toBeVisible();
  // The dialog opens before the proposal arrives and says "Proposal: a new
  // plan" until then, so wait for the proposal's own label rather than read
  // the heading once. A re-plan of an accepted plan is named after today,
  // the pinned 20 November (propose-plan.ts), never the machine's clock.
  reflowLabel = `Re-plan on ${PINNED_TODAY}`;
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
    `Proposal: ${reflowLabel}`,
  );
  await dialog.getByRole("button", { name: "Accept" }).click();
  await expect(dialog).toBeHidden();
  // the result is said, and the keyboard lands on it rather than on the page
  const accepted = page
    .getByRole("status")
    .filter({ hasText: "Plan accepted." });
  await expect(accepted).toBeFocused();
  // the reflow moved lessons: the board is not as it was
  await expect.poll(() => boardCells(page)).not.toEqual(before);
  expect((await planStatus(request)).head?.label).toBe(reflowLabel);
});

When("I undo it", async ({ page }) => {
  await page.getByRole("button", { name: "Undo last change" }).click();
});

Then("the plan is exactly as before", async ({ page, request }) => {
  await expect.poll(() => boardCells(page)).toEqual(before);
  const status = await planStatus(request);
  expect(status.head?.id).toBe(SEED_HEAD);
  expect(status.canUndo).toBe(false);
  // the fact is kept: the lesson on the cancelled day is waiting again
  await expect(
    page.getByRole("region", { name: "The plan is out of date" }),
  ).toBeVisible();
});

Then(
  "the reflow is still in the history so I can see what was undone",
  async ({ page }) => {
    const line = page.getByRole("status").filter({ hasText: "Undid" });
    await expect(line).toHaveText(
      `Undid: ${reflowLabel}. It stays in the plan's history; cancelled lessons and what you logged are kept.`,
    );
    await expect(line).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Undo last change" }),
    ).toHaveCount(0);
  },
);
