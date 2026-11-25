import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const TEST = { "x-planner-test": "1" };
const COURSE = "ial-business-u4";

const units = (page: Page) => page.getByRole("treeitem", { level: 1 });
const points = (page: Page) => page.getByRole("treeitem", { level: 2 });
const point = (page: Page, code: string) =>
  points(page).filter({
    hasText: new RegExp(`^${code.replace(".", "\\.")}(?!\\d)`),
  });

Given(
  "a draft pack with one spec point linked to no chapter",
  async ({ request, page }) => {
    const reset = await request.post("/api/test/reset", {
      headers: TEST,
      data: { state: "m2-draft-pack" },
    });
    expect(reset.ok()).toBe(true);
    await page.goto(`/setup/courses/${COURSE}/pack`);
    await expect(
      page.getByRole("heading", { level: 1, name: /Curriculum pack/ }),
    ).toBeVisible();
    await expect(points(page)).toHaveCount(8);
  },
);

const lockButton = (page: Page) =>
  page.getByRole("button", { name: "Lock", exact: true });

Then(
  '"Lock" is disabled and says one point is not linked',
  async ({ page }) => {
    await expect(lockButton(page)).toBeDisabled();
    await expect(
      page.getByRole("region", { name: "Before the pack can be locked" }),
    ).toContainText("1 point is not linked to a chapter: 1.5.");
  },
);

When(
  "I link that point to a chapter and mark every unit as checked",
  async ({ page }) => {
    const p = point(page, "1.5");
    await p
      .getByLabel("Chapter to link to 1.5")
      .selectOption({ label: "Chapter 5: Invented chapter 5" });
    await p.getByRole("button", { name: "Link chapter to 1.5" }).click();
    await expect(
      p.getByRole("list", { name: "Chapters linked to 1.5" }),
    ).toContainText("Invented chapter 5");
    for (const unit of await units(page).all()) {
      const box = unit.getByRole("checkbox", { name: "Checked" });
      if ((await box.count()) > 0) await box.check();
    }
  },
);

When("I lock the pack", async ({ page }) => {
  await expect(lockButton(page)).toBeEnabled();
  await lockButton(page).click();
});

Then(
  "the pack is shown as locked and cannot be edited",
  async ({ page, request }) => {
    await expect(page.getByText(/^Locked on \d{1,2} \w+ 2026/)).toBeVisible();
    await expect(lockButton(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit title/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(points(page)).toHaveCount(8);
    const courses = (await (await request.get("/api/courses")).json()) as {
      id: string;
      pack: string;
    }[];
    expect(courses.find((c) => c.id === COURSE)?.pack).toBe("locked");
  },
);

Then("each spec point shows a page reference", async ({ page }) => {
  for (const p of await points(page).all())
    await expect(p.getByText(/^Page \d+$/).first()).toBeVisible();
});

Then(
  "the link from chapter 1 to point 1.1 shows the reason {string} with the AI badge",
  async ({ page }, reason: string) => {
    const link = point(page, "1.1")
      .getByRole("list", { name: "Chapters linked to 1.1" })
      .getByRole("listitem")
      .filter({ hasText: "Chapter 1:" });
    await expect(link).toContainText(reason);
    await expect(
      link.getByRole("img", { name: "AI suggestion, not reviewed" }),
    ).toBeVisible();
  },
);

Then(
  "the AI's doubt {string} is shown with the AI badge",
  async ({ page }, note: string) => {
    const doubt = page
      .getByRole("region", { name: "Where the AI was unsure" })
      .getByRole("listitem")
      .filter({ hasText: note });
    await expect(doubt).toHaveCount(1);
    await expect(
      doubt.getByRole("img", { name: "AI suggestion, not reviewed" }),
    ).toBeVisible();
  },
);

Then("the draft says it is not yet reviewed", async ({ page }) => {
  await expect(page.getByRole("status")).toContainText(
    "Drafted by AI and not yet reviewed. Locking it is your review.",
  );
});

Then("no AI badge is left on the pack", async ({ page }) => {
  await expect(page.getByText(/^Locked on/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^AI suggestion/ })).toHaveCount(
    0,
  );
});

When(
  "I correct the title of point 1.5 to {string}",
  async ({ page }, title: string) => {
    const p = point(page, "1.5");
    await p.getByRole("button", { name: "Edit title of 1.5" }).click();
    await p.getByLabel("Title of 1.5").fill(title);
    await p.getByRole("button", { name: "Save title" }).click();
  },
);

Then(
  "point {word} is called {string}",
  async ({ page }, code: string, title: string) => {
    await expect(point(page, code)).toContainText(title);
  },
);

When(
  "I mark the unit {string} as out of scope",
  async ({ page }, title: string) => {
    const unit = units(page).filter({ hasText: title }).first();
    const box = unit.getByRole("checkbox", { name: "In scope" });
    // the box follows what the planner saved, so it changes a moment after the click
    await box.click();
    await expect(box).not.toBeChecked();
  },
);

Then('"Lock" is not held back by an unlinked point', async ({ page }) => {
  await expect(
    page.getByRole("region", { name: "Before the pack can be locked" }),
  ).not.toContainText("not linked");
  await expect(lockButton(page)).toBeEnabled();
});

Then("I can open and close a unit with the keyboard", async ({ page }) => {
  const unit = units(page).first();
  await unit.focus();
  await expect(unit).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(unit).toHaveAttribute("aria-expanded", "false");
  await expect(points(page)).toHaveCount(2);
  await page.keyboard.press("ArrowRight");
  await expect(unit).toHaveAttribute("aria-expanded", "true");
  await expect(points(page)).toHaveCount(8);
  await page.keyboard.press("Enter");
  await expect(unit).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(unit).toHaveAttribute("aria-expanded", "true");
  // Down moves to the first point of the open unit
  await page.keyboard.press("ArrowDown");
  await expect(points(page).first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(unit).toBeFocused();
});
