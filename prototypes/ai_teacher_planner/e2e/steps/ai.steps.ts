import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const TEST = { "x-planner-test": "1" };
const SKILL = "planner-suggest-lesson-counts";

const drawer = (page: Page) =>
  page.getByRole("dialog", { name: "AI activity" });
const suggestions = (page: Page) =>
  drawer(page).getByRole("list", { name: "Suggestions" }).getByRole("listitem");
const suggestion = (page: Page) => suggestions(page);

Given("the fake AI has suggested a lesson count", async ({ request }) => {
  const started = await request.post("/api/ai/jobs", {
    data: {
      skillId: SKILL,
      input: {
        courseTitle: "Synthetic Economics",
        mode: "differences",
        items: [
          { id: "ch3", title: "Markets", lessons: 4 },
          { id: "ch4", title: "Firms", lessons: 3 },
        ],
        unitTotals: [{ unitId: "u1", lessons: 20 }],
      },
    },
  });
  expect(started.status()).toBe(202);
  const { id } = (await started.json()) as { id: string };
  await expect
    .poll(async () => {
      const run = (await (await request.get(`/api/ai/jobs/${id}`)).json()) as {
        status: string;
      };
      return run.status;
    })
    .toBe("done");
});

Given("AI is switched off", async ({ request }) => {
  const res = await request.post("/api/test/ai", {
    headers: TEST,
    data: { mode: "off" },
  });
  expect(res.ok()).toBe(true);
});

Given("Claude Code is signed out", async ({ request }) => {
  const res = await request.post("/api/test/ai", {
    headers: TEST,
    data: { mode: "signed-out" },
  });
  expect(res.ok()).toBe(true);
});

/** The fake answers at once, so a running job is staged: the list, the progress stream and cancel are answered by the test. */
Given(
  "a job is running with the note {string}",
  async ({ page }, note: string) => {
    const run = {
      id: "staged-run",
      skillId: SKILL,
      status: "running",
      startedAt: "2026-11-20T09:00:00.000Z",
      durationMs: null,
      provider: "fake",
      model: null,
      failure: null,
      itemIds: [],
    };
    await page.route("**/api/ai/runs", (route) =>
      route.fulfill({ json: [run] }),
    );
    await page.route("**/api/ai/jobs/staged-run/events", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: `event: progress\ndata: ${JSON.stringify({ kind: "working", note })}\n\n`,
      }),
    );
    await page.route("**/api/ai/jobs/staged-run/cancel", (route) => {
      cancelled.add(page);
      return route.fulfill({
        json: {
          ...run,
          status: "cancelled",
          failure: "Cancelled. Nothing was saved.",
        },
      });
    });
  },
);
const cancelled = new WeakSet<Page>();

When("I open the activity drawer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^AI activity/ }).click();
  await expect(drawer(page)).toBeVisible();
});

When("I close the activity drawer", async ({ page }) => {
  await page.getByRole("button", { name: "Close" }).click();
  await expect(drawer(page)).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^AI activity/ }),
  ).toBeFocused();
});

When("I press Escape", async ({ page }) => {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

When("I open the legend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Legend" }).click();
});

Then(
  "I see one run of {string} by the fake provider",
  async ({ page }, skill: string) => {
    const runs = drawer(page).getByRole("list", { name: "AI runs" });
    await expect(runs.getByRole("listitem", { name: skill })).toHaveCount(1);
    await expect(runs).toContainText("fake");
  },
);

Then(
  "its suggestion has the {string} badge and a dashed outline",
  async ({ page }, label: string) => {
    const item = suggestion(page);
    await expect(item).toHaveCount(1);
    await expect(item.getByRole("img", { name: label })).toBeVisible();
    await expect(item).toHaveCSS("border-top-style", "dashed");
  },
);

When("I open where the suggestion came from", async ({ page }) => {
  await suggestion(page)
    .getByRole("button", { name: "Where this came from" })
    .click();
});

Then(
  "it names the provider {string}, the model {string} and the skill {string}",
  async ({ page }, provider: string, model: string, skillId: string) => {
    const facts = suggestion(page).getByRole("dialog", {
      name: "Where this came from",
    });
    const definitionOf = (term: string) =>
      facts
        .locator("dt", { hasText: term })
        .locator("xpath=following-sibling::dd[1]");
    await expect(definitionOf("Provider")).toHaveText(provider);
    await expect(definitionOf("Model")).toHaveText(model);
    await expect(definitionOf("Skill")).toHaveText(skillId);
    await expect(definitionOf("Time")).toHaveText(
      /^\d{1,2} \w+ \d{4}, \d\d:\d\d$/,
    );
  },
);

Then("it says there were no sources", async ({ page }) => {
  await expect(suggestion(page).getByText("No sources")).toBeVisible();
});

When("I accept the suggestion", async ({ page }) => {
  await suggestion(page).getByRole("button", { name: "Accept" }).click();
});

When("I edit the suggestion to {int} lessons", async ({ page }, n: number) => {
  await suggestion(page).getByRole("button", { name: "Edit" }).click();
  await suggestion(page).getByLabel("Lessons").fill(String(n));
  await suggestion(page).getByRole("button", { name: "Save edit" }).click();
});

Then(
  "the suggestion has the {string} badge and no dashed outline",
  async ({ page }, label: string) => {
    const item = suggestions(page).filter({
      has: page.getByRole("img", { name: label }),
    });
    await expect(item).toHaveCount(1);
    await expect(item).not.toHaveCSS("border-top-style", "dashed");
  },
);

Then("the suggestion says {string}", async ({ page }, text: string) => {
  await expect(drawer(page)).toContainText(text);
});

Then("the legend says {string}", async ({ page }, text: string) => {
  await expect(
    page
      .getByRole("dialog", { name: "Legend" })
      .getByText(text, { exact: true }),
  ).toBeVisible();
});

Then("the header says {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("banner")).toContainText(text);
});

When("I cancel the running job", async ({ page }) => {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Cancel AI job" })
    .click();
});

Then("the planner was asked to cancel that job", async ({ page }) => {
  await expect.poll(() => cancelled.has(page)).toBe(true);
});

Then(
  "the header says AI is off and the board still opens",
  async ({ page }) => {
    await expect(page.getByRole("banner")).toContainText("AI is switched off");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Week 1/ })).toBeVisible();
  },
);

When("I press Escape once", async ({ page }) => {
  await page.keyboard.press("Escape");
});

Then("the drawer is still open and the popover is closed", async ({ page }) => {
  await expect(drawer(page)).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Where this came from" }),
  ).toHaveCount(0);
});

Then("the drawer is closed", async ({ page }) => {
  await expect(drawer(page)).toHaveCount(0);
});
