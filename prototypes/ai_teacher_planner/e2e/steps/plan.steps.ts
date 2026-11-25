import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";
import {
  COURSE,
  cancelDay,
  planStatus,
  proposalDialog,
  resetTo,
  SEED_HEAD,
  YEAR_13,
} from "../support/plan.ts";

const positionsCard = (page: Page) =>
  page.getByRole("region", { name: "Where each group is" });
const cell = (page: Page, name: string) =>
  page.getByRole("cell", { name, exact: true });

async function askForPlanInSetup(page: Page) {
  await page.goto("/setup");
  await positionsCard(page)
    .getByRole("button", { name: "Ask for a plan" })
    .click();
  await expect(proposalDialog(page)).toBeVisible();
}

Given(
  "the course has a locked pack and a scheme but no positions",
  async ({ request }) => {
    await resetTo(request, "m2-no-positions");
  },
);

Given("the course has an accepted plan", async ({ request }) => {
  await resetTo(request, "m2-planned");
});

When(
  "I set each Year 13 group's next lesson and ask for a plan",
  async ({ page }) => {
    await page.goto("/setup");
    const card = positionsCard(page);
    await expect(card).toContainText("Tell the planner where each group is");
    // no plan can be asked for before the positions are saved
    await expect(
      card.getByRole("button", { name: "Ask for a plan" }),
    ).toBeDisabled();
    for (const group of YEAR_13)
      await card
        .getByLabel(`Next lesson for ${group}`)
        .selectOption({ label: "Supply, lesson 1 of 4" });
    await card.getByRole("button", { name: "Save positions" }).click();
    await expect(card.getByRole("status")).toHaveText("Positions saved.");
    await expect(card).not.toContainText(
      "Tell the planner where each group is",
    );
    await card.getByRole("button", { name: "Ask for a plan" }).click();
  },
);

Then(
  "I see a proposal with every group's lessons placed and no conflicts",
  async ({ page }) => {
    const dialog = proposalDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      "Proposal: First plan",
    );
    const summary = dialog.getByRole("table", {
      name: "Before and after, by group",
    });
    const row = (label: string) =>
      summary.getByRole("row", { name: new RegExp(`^${label}`) });
    // the synthetic scheme has 13 lessons; Demand is declared, the rest are placed
    await expect(row("Lessons placed").getByRole("cell")).toHaveText([
      "13",
      "13",
      "13",
    ]);
    await expect(
      row("Lessons after the official exam").getByRole("cell"),
    ).toHaveText(["0", "0", "0"]);
    await expect(dialog).toContainText("No conflicts.");
  },
);

When("I accept the proposal", async ({ page }) => {
  await proposalDialog(page).getByRole("button", { name: "Accept" }).click();
});

Then("the board shows lesson titles on real dates", async ({ page }) => {
  await expect(proposalDialog(page)).toBeHidden();
  await page.goto("/board");
  const friday = cell(page, "13 1, Friday 20 November, period 6, room 206");
  await expect(friday).toHaveAccessibleDescription("Supply, 1 of 4, planned");
  await expect(friday).toContainText("Supply · 1 of 4");
  await expect(
    page.locator('td[data-date="2026-11-23"][data-period="5"]'),
  ).toHaveAccessibleDescription("Supply, 2 of 4, planned");
  // before the day she gave the positions, the board names what was declared
  await expect(
    page.locator('td[data-date="2026-11-16"][data-period="5"]'),
  ).toContainText("Declared: Demand");
});

Given(
  "a proposal is open and the scheme is then changed in another tab",
  async ({ page, request }) => {
    await resetTo(request, "m2-planned");
    await askForPlanInSetup(page);
    // the other tab saves Markets with 5 lessons instead of 4
    const scheme = (await (
      await request.get(`/api/scheme/${COURSE}`)
    ).json()) as {
      items: { title: string; lessons: number }[];
      overrides: unknown[];
    };
    const res = await request.put(`/api/scheme/${COURSE}`, {
      data: {
        items: scheme.items.map((i) =>
          i.title === "Markets" ? { ...i, lessons: 5 } : i,
        ),
        overrides: scheme.overrides,
      },
    });
    expect(res.status()).toBe(200);
  },
);

Then(
  "I am told the plan changed and nothing is applied",
  async ({ page, request }) => {
    const dialog = proposalDialog(page);
    await expect(dialog.getByRole("alert")).toHaveText(
      "The plan changed while this was open. Nothing was applied.",
    );
    await expect(dialog.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect((await planStatus(request)).head?.id).toBe(SEED_HEAD);
  },
);

When("I ask for the new proposal", async ({ page }) => {
  await proposalDialog(page)
    .getByRole("button", { name: "Show the new proposal" })
    .click();
});

Then("the proposal can be accepted", async ({ page, request }) => {
  const dialog = proposalDialog(page);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  // the new proposal plans the fifth Markets lesson
  await expect(dialog).toContainText("Markets 5 of 5");
  await dialog.getByRole("button", { name: "Accept" }).click();
  await expect(dialog).toBeHidden();
  const status = await planStatus(request);
  expect(status.head?.id).not.toBe(SEED_HEAD);
  expect(status.canUndo).toBe(true);
});

When("I open a spare lesson", async ({ page }) => {
  await page.goto("/board");
  // 13 3's spare lesson before the 20-mark test
  await page
    .locator('td[data-date="2026-11-26"][data-period="4"]')
    .getByRole("button", { name: "Spare lesson" })
    .click();
});

When(
  "13 1's lessons on Monday 23 November 2026 are cancelled",
  async ({ request }) => {
    await cancelDay(request, "13 1", "2026-11-23");
  },
);

Then(
  "the board draws 13 1's lesson on Monday 23 November as cancelled",
  async ({ page }) => {
    await page.goto("/board");
    const monday = page.locator('td[data-date="2026-11-23"][data-period="5"]');
    await expect(monday).toHaveAttribute("data-status", "cancelled");
    await expect(monday).toContainText("Markets · 3 of 4");
    await expect(monday).toHaveAccessibleDescription(
      "Markets, 3 of 4, cancelled, not moved until you accept a new plan",
    );
  },
);

Then("the board and Today say {string}", async ({ page }, text: string) => {
  const banner = page.getByRole("region", { name: text });
  await expect(banner).toContainText(
    "the calendar, the scheme or the positions changed",
  );
  await page.goto("/");
  await expect(page.getByRole("region", { name: text })).toContainText(
    "the calendar, the scheme or the positions changed",
  );
});

When("I press {string} on the board", async ({ page }, name: string) => {
  await page.goto("/board");
  await page.getByRole("button", { name, exact: true }).click();
});

Then(
  "the proposal lists 13 1's lesson from Monday 23 November first",
  async ({ page }) => {
    const changes = proposalDialog(page).getByRole("region", {
      name: "Changes for 13 1",
    });
    await expect(changes.getByRole("listitem").first()).toHaveText(
      "Markets 3 of 4: its lesson was cancelled. Monday 23 November, period 5 → Wednesday 25 November, period 2",
    );
  },
);

When("I ask for a new plan in Setup", async ({ page }) => {
  await askForPlanInSetup(page);
});

When("I cancel the proposal", async ({ page }) => {
  await proposalDialog(page).getByRole("button", { name: "Cancel" }).click();
});

Then(
  "nothing is stored and the focus is back on {string}",
  async ({ page, request }, name: string) => {
    await expect(proposalDialog(page)).toBeHidden();
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
    const status = await planStatus(request);
    expect(status.head?.id).toBe(SEED_HEAD);
    expect(status.canUndo).toBe(false);
  },
);
