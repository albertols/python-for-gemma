import { expect, type Page } from "@playwright/test";
import type {
  AiRun,
  PublicProgress,
} from "../../apps/api/src/usecases/ai-jobs.ts";
import { Given, Then, When } from "../support/fixtures.ts";

const TEST = { "x-planner-test": "1" };
const SKILL = "planner-suggest-lesson-counts";

const drawer = (page: Page) =>
  page.getByRole("dialog", { name: "AI activity" });
const suggestions = (page: Page) =>
  drawer(page).getByRole("list", { name: "Suggestions" }).getByRole("listitem");

Given("the fake AI has suggested a lesson count", async ({ request }) => {
  // accepting writes the count, so the course needs its synthetic scheme
  const reset = await request.post("/api/test/reset", {
    headers: TEST,
    data: { state: "m2-no-positions" },
  });
  expect(reset.ok()).toBe(true);
  const started = await request.post("/api/ai/jobs", {
    data: {
      skillId: SKILL,
      input: {
        courseId: "ial-business-u4",
        courseTitle: "IAL Business Unit 4",
        mode: "differences",
        items: [
          { id: "ch3", title: "Markets", lessons: 4 },
          { id: "ch4", title: "Prices", lessons: 2 },
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
    const run: AiRun = {
      id: "staged-run",
      skillId: SKILL,
      status: "running",
      startedAt: "2026-11-20T09:00:00.000Z",
      durationMs: null,
      provider: "fake",
      model: null,
      failure: null,
      note: null,
      itemIds: [],
    };
    await page.route("**/api/ai/runs", (route) =>
      route.fulfill({ json: [run] }),
    );
    const progress: PublicProgress = { kind: "working", note };
    await page.route("**/api/ai/jobs/staged-run/events", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
      }),
    );
    await page.route("**/api/ai/jobs/staged-run/cancel", (route) => {
      cancelled.add(page);
      const stopped: AiRun = {
        ...run,
        status: "cancelled",
        failure: "Cancelled. Nothing was saved.",
      };
      return route.fulfill({ json: stopped });
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
    const item = suggestions(page);
    await expect(item).toHaveCount(1);
    await expect(item.getByRole("img", { name: label })).toBeVisible();
    await expect(item).toHaveCSS("border-top-style", "dashed");
  },
);

When("I open where the suggestion came from", async ({ page }) => {
  await suggestions(page)
    .getByRole("button", { name: "Where this came from" })
    .click();
});

Then(
  "it names the provider {string}, the model {string} and the skill {string}",
  async ({ page }, provider: string, model: string, skillId: string) => {
    const facts = suggestions(page).getByRole("dialog", {
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
  await expect(suggestions(page).getByText("No sources")).toBeVisible();
});

When("I accept the suggestion", async ({ page }) => {
  await suggestions(page).getByRole("button", { name: "Accept" }).click();
});

When("I edit the suggestion to {int} lessons", async ({ page }, n: number) => {
  await suggestions(page).getByRole("button", { name: "Edit" }).click();
  await suggestions(page).getByLabel("Lessons").fill(String(n));
  await suggestions(page).getByRole("button", { name: "Save edit" }).click();
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

Then("the focus is back on {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
});

When(
  "I open the legend and then the activity drawer with the keyboard",
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const legend = page.getByRole("button", { name: "Legend" });
    await legend.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Legend" })).toBeVisible();
    const activity = page.getByRole("button", { name: /^AI activity/ });
    await activity.focus();
    await page.keyboard.press("Enter");
    await expect(drawer(page)).toBeVisible();
  },
);

Then("the legend is still open", async ({ page }) => {
  await expect(page.getByRole("dialog", { name: "Legend" })).toBeVisible();
});

Then("the legend is closed", async ({ page }) => {
  await expect(page.getByRole("dialog", { name: "Legend" })).toHaveCount(0);
});

Then("nothing behind the drawer can take focus", async ({ page }) => {
  // Tab round more times than there are controls: the focus is in the drawer or has left the page
  // (the browser's own bar), and is never on the page behind.
  const total = await drawer(page).getByRole("button").count();
  for (let i = 0; i < total + 3; i++) {
    await page.keyboard.press("Tab");
    const behind = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      return !el.closest('[role="dialog"][aria-label="AI activity"]');
    });
    expect(behind).toBe(false);
  }
  await expect(page.getByRole("main")).toHaveAttribute("inert", "");
});
