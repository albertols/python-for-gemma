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

Then("the proposal lists {string} first", async ({ page }, text: string) => {
  const hit = proposalDialog(page).getByRole("region", {
    name: "Lessons that lost their slot",
  });
  await expect(hit.getByRole("listitem").first()).toHaveText(text);
});

When("I close the proposal with Escape", async ({ page }) => {
  await expect(proposalDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(proposalDialog(page)).toBeHidden();
});

When("I accept the new plan from Today", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "See what changes" }).click();
  await proposalDialog(page).getByRole("button", { name: "Accept" }).click();
});

/** The screen's plan status line says it, and the keyboard is on it. */
async function saysWithFocus(page: Page, text: string) {
  await expect(proposalDialog(page)).toBeHidden();
  const line = page.getByRole("status").filter({ hasText: text });
  await expect(line).toHaveText(text);
  await expect(line).toBeFocused();
}
Then(
  "Today says {string} with the focus on it",
  async ({ page }, text: string) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("2026");
    await saysWithFocus(page, text);
  },
);
Then(
  "the board says {string} with the focus on it",
  async ({ page }, text: string) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Board");
    await saysWithFocus(page, text);
  },
);

Then("undo goes back to the first plan", async ({ page, request }) => {
  const now = await planStatus(request);
  expect(now.head?.id).not.toBe(SEED_HEAD);
  expect(now.canUndo).toBe(true);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Undid" }),
  ).toBeFocused();
  expect((await planStatus(request)).head?.id).toBe(SEED_HEAD);
});

When(
  "13 1's Week 2 Monday period 5 is taken out of the timetable",
  async ({ request }) => {
    const timetable = (await (await request.get("/api/timetable")).json()) as {
      versions: {
        id: string;
        entries: {
          week: string;
          weekday: number;
          period: number;
          groupId: string;
        }[];
        duties: unknown[];
      }[];
    };
    const version = timetable.versions[0];
    if (!version) throw new Error("no timetable");
    const entries = version.entries.filter(
      (e) =>
        !(
          e.groupId === "13 1" &&
          e.week === "W2" &&
          e.weekday === 1 &&
          e.period === 5
        ),
    );
    expect(entries).toHaveLength(version.entries.length - 1);
    const res = await request.put(`/api/timetable/${version.id}`, {
      data: { entries, duties: version.duties },
    });
    expect(res.status()).toBe(200);
  },
);

Then("the out-of-date banner says {string}", async ({ page }, text: string) => {
  await page.goto("/board");
  await expect(
    page.getByRole("region", { name: "The plan is out of date" }),
  ).toContainText(text);
});

When(
  "the plan status cannot be loaded and I open the board",
  async ({ page }) => {
    await page.route("**/api/plans/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "broken", message: "Something broke." },
        }),
      }),
    );
    await page.goto("/board");
  },
);

Then("the board shows {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});
