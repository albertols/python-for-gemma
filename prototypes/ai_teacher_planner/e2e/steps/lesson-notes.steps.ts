import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";
import { boardCells, COURSE } from "../support/plan.ts";

/** A tiny file that is a PDF as far as the planner can tell: the signature and a line. Synthetic, made here. */
const SMALL_PDF = Buffer.from("%PDF-1.4\n%synthetic test file\n");

const planBox = (page: Page) => page.getByLabel("Plan for this lesson");
const materials = (page: Page) => page.getByRole("list", { name: "Materials" });

async function lookAtToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Friday 20 November 2026",
  );
}

async function openPlanFor13_1(page: Page) {
  await lookAtToday(page);
  const toggle = page
    .getByRole("button", { name: /^Plan and materials for 13 1,/ })
    .first();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(planBox(page)).toBeVisible();
}

When("I look at Today", async ({ page }) => {
  await lookAtToday(page);
});

When("I open the plan and materials for 13 1 on Today", async ({ page }) => {
  await openPlanFor13_1(page);
});

When("I reload and open the plan and materials for 13 1", async ({ page }) => {
  await page.reload();
  await openPlanFor13_1(page);
});

When(
  "I write the plan {string} and save it",
  async ({ page }, text: string) => {
    await planBox(page).fill(text);
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Plan saved." }),
    ).toBeVisible();
  },
);

When("I attach a small PDF called {string}", async ({ page }, name: string) => {
  await page
    .getByLabel("Attach a file")
    .setInputFiles({ name, mimeType: "application/pdf", buffer: SMALL_PDF });
  await expect(materials(page).getByRole("link", { name })).toBeVisible();
});

When(
  "I attach a file called {string} holding {string}",
  async ({ page }, name: string, content: string) => {
    await page.getByLabel("Attach a file").setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(content),
    });
  },
);

Then("the plan {string} is shown", async ({ page }, text: string) => {
  await expect(planBox(page)).toHaveValue(text);
});

Then("{string} is listed under Materials", async ({ page }, name: string) => {
  await expect(materials(page).getByRole("link", { name })).toBeVisible();
});

When("I remove {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name: `Remove ${name}` }).click();
});

Then("{string} is not listed", async ({ page }, name: string) => {
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await expect(page.getByText("Nothing attached yet.")).toBeVisible();
});

Then("I am told {string}", async ({ page }, message: string) => {
  await expect(
    page.getByRole("alert").filter({ hasText: message }),
  ).toBeVisible();
});

Then("no file is listed under Materials", async ({ page }) => {
  await expect(page.getByText("Nothing attached yet.")).toBeVisible();
});

Then(
  "13 1's lesson on Friday 20 November shows a paper clip with 2 files",
  async ({ page }) => {
    const cell = page
      .locator('td[aria-label^="13 1, Friday 20 November"]')
      .filter({ has: page.locator("[data-clips]") });
    await expect(cell).toHaveCount(1);
    await expect(cell.locator("[data-clips]")).toHaveText("2");
    const cells = await boardCells(page);
    expect(
      cells.filter(
        (c) =>
          c.startsWith("13 1, Friday 20 November") &&
          c.endsWith("2 files attached"),
      ),
    ).toHaveLength(1);
  },
);

Then("no lesson offers a plan and materials", async ({ page }) => {
  await expect(page.getByText("No lesson planned").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Plan and materials/ }),
  ).toHaveCount(0);
});

Given(
  "13 1 has a plan and a file for Markets, lesson 4 of 4",
  async ({ request }) => {
    const query = "groupId=13%201&lessonId=ch3%234";
    const note = await request.put(`/api/lesson-notes?${query}`, {
      data: { text: "Case study on pricing" },
    });
    expect(note.ok()).toBe(true);
    const file = await request.post(`/api/lesson-notes/materials?${query}`, {
      headers: { "x-planner-upload": "1" },
      multipart: {
        file: {
          name: "Kept.pdf",
          mimeType: "application/pdf",
          buffer: SMALL_PDF,
        },
      },
    });
    expect(file.status()).toBe(201);
  },
);

When(
  "the scheme gives Markets two lessons and the new plan is accepted",
  async ({ request }) => {
    const scheme = await (await request.get(`/api/scheme/${COURSE}`)).json();
    const put = await request.put(`/api/scheme/${COURSE}`, {
      data: {
        items: scheme.items.map((i: { id: string }) =>
          i.id === "ch3" ? { ...i, lessons: 2 } : i,
        ),
        overrides: [],
      },
    });
    expect(put.ok()).toBe(true);
    const proposal = await (
      await request.post(`/api/plans/${COURSE}/proposals`)
    ).json();
    const accepted = await request.post(`/api/plans/${COURSE}/accept`, {
      data: {
        baseRevisionId: proposal.baseRevisionId,
        candidateKey: proposal.candidateKey,
      },
    });
    expect(accepted.ok()).toBe(true);
  },
);

Then(
  "under {string} I see {string}",
  async ({ page }, heading: string, text: string) => {
    await expect(
      page.getByRole("region", { name: heading, exact: true }),
    ).toContainText(text);
  },
);

Then(
  "I see the plan {string} and {string} there",
  async ({ page }, text: string, file: string) => {
    const region = page.getByRole("region", {
      name: "Notes for lessons no longer in the plan",
      exact: true,
    });
    await expect(region.getByLabel("Plan for this lesson")).toHaveValue(text);
    await expect(region.getByRole("link", { name: file })).toBeVisible();
  },
);

/** The requests that tried to attach a file, per page. */
const attachRequests = new WeakMap<Page, string[]>();

When(
  "I attach a file called {string} of {int} MB",
  async ({ page }, name: string, mb: number) => {
    const seen: string[] = [];
    attachRequests.set(page, seen);
    page.on("request", (r) => {
      if (r.url().includes("/api/lesson-notes/materials"))
        seen.push(r.method());
    });
    const buffer = Buffer.alloc(mb * 1024 * 1024);
    SMALL_PDF.copy(buffer);
    await page
      .getByLabel("Attach a file")
      .setInputFiles({ name, mimeType: "application/pdf", buffer });
  },
);

Then("nothing was sent to attach a file", async ({ page }) => {
  // give a wrongly sent request time to show up
  await page.waitForTimeout(300);
  expect(attachRequests.get(page)).toEqual([]);
});

When(
  "I attach a small JPEG called {string}",
  async ({ page }, name: string) => {
    await page.getByLabel("Attach a file").setInputFiles({
      name,
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
    });
    await expect(materials(page).getByRole("link", { name })).toBeVisible();
  },
);
