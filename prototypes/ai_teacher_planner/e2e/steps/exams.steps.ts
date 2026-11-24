import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const MOCK_WEEK = ["11", "12", "13", "14", "15"].map((d) => `2027-01-${d}`);

Given(
  "{string} is confirmed for Year 13",
  async ({ request }, text: string) => {
    expect(text).toBe("Mock exams");
    const res = await request.put("/api/events/classifications/e2e-mocks", {
      data: {
        wordingKey: "mock exams",
        yearGroup: 13,
        onlyDates: MOCK_WEEK,
        decision: "cancels",
        groupIds: null,
        periods: null,
        until: null,
      },
    });
    expect(res.status()).toBe(200);
  },
);

Given(
  "{string} is confirmed for 13 1, 13 3 and 13 5 until 29 June 2027",
  async ({ request }, text: string) => {
    expect(text).toBe("Study leave starts");
    const res = await request.put("/api/events/classifications/e2e-leave", {
      data: {
        wordingKey: "study leave starts",
        yearGroup: null,
        onlyDates: ["2027-05-05", "2027-05-11"],
        decision: "cancels",
        groupIds: ["13 1", "13 3", "13 5"],
        periods: null,
        until: "2027-06-29",
      },
    });
    expect(res.status()).toBe(200);
  },
);

async function openAudit(page: Page) {
  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { name: "Last lesson and official exams" }),
  ).toBeVisible();
}

Then(
  "the slot audit lists {string} under lessons that will not run, with a count for 13 1",
  async ({ page }, reason: string) => {
    await openAudit(page);
    const item = page.locator("li[data-reason]").filter({
      has: page.getByText(reason, { exact: true }),
    });
    await expect(item).toHaveCount(1);
    await expect(item.locator('li[data-group="13 1"]')).toContainText(
      /13 1: \d+ lessons?/,
    );
    // The same counts as the API gives, not a number typed into the test.
    const audit = (await (await page.request.get("/api/audit")).json()) as {
      lostByReason: { reason: string; perGroup: Record<string, number> }[];
    };
    const count = audit.lostByReason.find((r) => r.reason === reason)?.perGroup[
      "13 1"
    ];
    expect(count).toBeGreaterThan(0);
    await expect(item.locator('li[data-group="13 1"]')).toContainText(
      `13 1: ${count} lesson`,
    );
  },
);

Then(
  "the slot audit shows {string} on Tuesday 1 June 2027 for 13 1, 13 3 and 13 5",
  async ({ page }, code: string) => {
    await openAudit(page);
    for (const group of ["13 1", "13 3", "13 5"]) {
      const row = page.locator(`li[data-last-lesson="${group}"]`);
      await expect(row).toContainText(code);
      await expect(row).toContainText("Tuesday 1 June 2027");
    }
    await expect(page.locator('li[data-last-lesson="11D"]')).not.toContainText(
      code,
    );
  },
);

Then(
  "the last lesson of 13 1 on the slot audit is on or before 7 May 2027",
  async ({ page }) => {
    await openAudit(page);
    const row = page.locator('li[data-last-lesson="13 1"]');
    await expect(row).toContainText("last lesson");
    const audit = (await (await page.request.get("/api/audit")).json()) as {
      lastLesson: Record<string, string | null>;
    };
    const last = audit.lastLesson["13 1"];
    expect(last && last <= "2027-05-07").toBe(true);
    await expect(row).toContainText(/last lesson \w+ \d+ May 2027/);
  },
);

async function openExams(page: Page) {
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Official exams" }),
  ).toBeVisible();
  await expect(page.locator("li[data-exam]").first()).toBeVisible();
}

When("I open the official exams in Setup", async ({ page }) => openExams(page));

Then(
  "I see the exams {string}, {string} and {string}, each with a source link",
  async ({ page }, a: string, b: string, c: string) => {
    for (const code of [a, b, c]) {
      const row = page.locator(`li[data-exam="${code}"]`);
      await expect(row).toBeVisible();
      const link = row.getByRole("link", { name: `Source of ${code}` });
      await expect(link).toHaveAttribute(
        "href",
        /^https:\/\/qualifications\.pearson\.com\//,
      );
    }
  },
);

When("I open the form to add an exam", async ({ page }) => {
  await openExams(page);
  await page.getByRole("button", { name: "Add an exam" }).click();
  await expect(page.getByRole("form", { name: "Add an exam" })).toBeVisible();
});

async function fillForm(page: Page, code: string, title: string, date: string) {
  const form = page.getByRole("form", { name: "Add an exam" });
  await form.getByLabel("Code").fill(code);
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Date").fill(date);
  await form.getByRole("checkbox", { name: "13 1" }).check();
  return form;
}

When(
  "I add the exam {string} called {string} on 27 November 2026 for 13 1",
  async ({ page }, code: string, title: string) => {
    await openExams(page);
    await page.getByRole("button", { name: "Add an exam" }).click();
    const form = await fillForm(page, code, title, "2026-11-27");
    await form.getByRole("button", { name: "Save exam" }).click();
    await expect(page.locator(`li[data-exam="${code}"]`)).toBeVisible();
  },
);

When("I remove the exam {string}", async ({ page }, code: string) => {
  await openExams(page);
  await page.getByRole("button", { name: `Remove ${code}` }).click();
  await expect(page.getByRole("status")).toContainText(`Removed ${code}`);
  await expect(page.locator(`li[data-exam="${code}"]`)).toHaveCount(0);
});

Then(
  "Today lists {string} under Coming up",
  async ({ page }, label: string) => {
    await page.goto("/");
    await expect(
      page.getByRole("listitem").filter({ hasText: label }),
    ).toContainText("in 7 days");
  },
);

Then(
  "Today does not list {string} under Coming up",
  async ({ page }, label: string) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(label)).toHaveCount(0);
  },
);

When("I try to add an exam called with 121 characters", async ({ page }) => {
  await openExams(page);
  await page.getByRole("button", { name: "Add an exam" }).click();
  const form = page.getByRole("form", { name: "Add an exam" });
  // The box stops typing at 120, so the 121st character can only arrive another way: the API answers it.
  await form
    .getByLabel("Title")
    .evaluate((el) => el.removeAttribute("maxlength"));
  await fillForm(page, "LONG 1", "x".repeat(121), "2026-11-27");
  await form.getByRole("button", { name: "Save exam" }).click();
});

Then("I am told the title can be at most 120 characters", async ({ page }) => {
  await expect(page.getByRole("alert")).toContainText(
    "The title can be at most 120 characters",
  );
  await expect(page.locator('li[data-exam="LONG 1"]')).toHaveCount(0);
});
