import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const MOCK_FIRST = "2027-01-11";
const MOCK_LAST = "2027-01-15";

const rowOf = (page: Page, text: string, year?: number) =>
  page
    .locator("li[data-event]")
    .filter({ has: page.getByText(text, { exact: true }) })
    .filter(year === undefined ? {} : { hasText: `Year ${year},` })
    .first();

async function openEvents(page: Page) {
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", {
      name: "Calendar events that may affect your lessons",
    }),
  ).toBeVisible();
  await expect(page.locator("li[data-event]").first()).toBeVisible();
}

const MOCK_WEEK = ["11", "12", "13", "14", "15"].map((d) => `2027-01-${d}`);
const lessonCells = (page: Page, group: RegExp) =>
  page
    .locator(
      MOCK_WEEK.map((d) => `td[data-kind="lesson"][data-date="${d}"]`).join(
        ",",
      ),
    )
    .filter({ hasText: group });

async function board(page: Page, monday: string) {
  await page.goto(`/board?w1=${monday}`);
  await expect(page.getByRole("table").first()).toBeVisible();
}

When("I open the calendar events in Setup", async ({ page }) =>
  openEvents(page),
);

When("I open the details for {string}", async ({ page }, text: string) => {
  await openEvents(page);
  const row = rowOf(page, text);
  await row.getByRole("button", { name: "Cancels my lessons" }).click();
  await expect(
    row.getByRole("group", { name: "Which of your groups" }),
  ).toBeVisible();
});

async function confirmMocks(page: Page) {
  await openEvents(page);
  const row = rowOf(page, "Mock exams", 13);
  await row.getByRole("button", { name: "Cancels my lessons" }).click();
  await expect(row.getByTestId("event-lesson-count")).toContainText(
    "lessons would be cancelled",
  );
  await row.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(row.getByRole("status")).toContainText("Saved");
  await expect(row).toContainText("Cancels Year 13");
}

When(
  "I confirm that {string} cancels my Year 13 lessons",
  async ({ page }, text: string) => {
    expect(text).toBe("Mock exams");
    await confirmMocks(page);
  },
);
Given(
  "I have confirmed that {string} cancels my Year 13 lessons",
  async ({ page }, text: string) => {
    expect(text).toBe("Mock exams");
    await confirmMocks(page);
  },
);

When(
  "I confirm {string} for 13 1, 13 3 and 13 5 lasting until 29 June 2027",
  async ({ page }, text: string) => {
    await openEvents(page);
    const row = rowOf(page, text);
    await row.getByRole("button", { name: "Cancels my lessons" }).click();
    for (const other of ["11D", "IB H", "IB S"])
      await row.getByRole("checkbox", { name: other }).uncheck();
    await row.getByLabel("Lasts until").fill("2027-06-29");
    await expect(row.getByTestId("event-lesson-count")).toContainText(
      "lessons would be cancelled",
    );
    await row.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(row.getByRole("status")).toContainText("Saved");
  },
);

When("I undo the mock week confirmation", async ({ page }) => {
  await openEvents(page);
  const row = rowOf(page, "Mock exams", 13);
  await row.getByRole("button", { name: /^Undo Mock exams/ }).click();
  await expect(row.getByRole("status")).toContainText("Undone");
});

Then(
  /^the Year 13 lessons on 11 January 2027 show "([^"]*)"( again)?$/,
  async ({ page }, text: string, _again?: string) => {
    await board(page, MOCK_FIRST);
    const cells = page
      .locator(`td[data-kind="lesson"][data-date="${MOCK_FIRST}"]`)
      .filter({ hasText: /^13 / });
    expect(await cells.count()).toBeGreaterThan(0);
    for (const cell of await cells.all()) {
      await expect(cell).toContainText(text);
      await expect(cell).toHaveAttribute("aria-label", new RegExp(text));
      await expect(cell).not.toHaveAttribute("aria-label", /cancelled/);
      // A lesson that is only possibly disrupted keeps its full colour.
      await expect(cell).toHaveAttribute("data-status", "open");
    }
  },
);

Then(
  "the slot audit counts no cancelled lessons that week",
  async ({ request }) => {
    const audit = (await (await request.get("/api/audit")).json()) as {
      lost: { date: string }[];
    };
    expect(
      audit.lost.filter((s) => s.date >= MOCK_FIRST && s.date <= MOCK_LAST),
    ).toEqual([]);
  },
);

Then(
  "the Year 13 lessons that week show as cancelled with the reason {string}",
  async ({ page }, reason: string) => {
    await board(page, MOCK_FIRST);
    const cells = lessonCells(page, /^13 /);
    expect(await cells.count()).toBeGreaterThan(0);
    for (const cell of await cells.all()) {
      await expect(cell).toHaveAttribute(
        "aria-label",
        new RegExp(`, cancelled: ${reason}`),
      );
      await expect(cell).not.toContainText("Possible disruption");
      // Cancelled cells are marked, and say so in words on the page.
      await expect(cell).toHaveAttribute("data-status", "cancelled");
      await expect(cell).toContainText("Cancelled");
    }
  },
);

Then("IB S lessons that week are unchanged", async ({ page }) => {
  const cells = lessonCells(page, /^IB S/);
  expect(await cells.count()).toBeGreaterThan(0);
  for (const cell of await cells.all()) {
    await expect(cell).not.toHaveAttribute("aria-label", /cancelled/);
    await expect(cell).toHaveAttribute("data-status", "open");
  }
});

Then(
  "the slot audit shows no Year 13 lessons after 7 May 2027",
  async ({ page, request }) => {
    const audit = (await (await request.get("/api/audit")).json()) as {
      lost: { groupId: string; date: string }[];
    };
    const slots = (await (
      await request.get("/api/slots?from=2027-05-08&to=2027-06-30")
    ).json()) as {
      groupId: string;
      status: string;
      reasons: { text: string }[];
    }[];
    const y13 = slots.filter((s) => s.groupId.startsWith("13 "));
    expect(y13.length).toBeGreaterThan(0);
    expect(y13.every((s) => s.status === "cancelled")).toBe(true);
    // The reason is the event's words, shown once.
    expect(
      y13.every(
        (s) =>
          s.reasons.length === 1 && s.reasons[0]?.text === "Study leave starts",
      ),
    ).toBe(true);
    expect(
      audit.lost.filter(
        (s) => s.groupId.startsWith("13 ") && s.date > "2027-05-07",
      ).length,
    ).toBe(y13.length);
    // The same on the screen: the last teaching block has no open Year 13 lessons.
    await page.goto("/audit");
    const table = page.getByRole("table", { name: /lessons per group/i });
    await expect(table).toBeVisible();
    const headers = await table.locator("thead th").allTextContents();
    const last = table.locator("tbody tr").last();
    for (const g of ["13 1", "13 3", "13 5"]) {
      const column = headers.indexOf(g) - 1;
      await expect(last.locator("td").nth(column)).toContainText(
        /\(\d+ lost\)/,
      );
    }
  },
);

When("I open the board at the mock week", async ({ page }) =>
  board(page, MOCK_FIRST),
);
