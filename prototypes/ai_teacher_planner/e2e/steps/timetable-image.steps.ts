import { expect } from "@playwright/test";
import { Then, When } from "../support/fixtures.ts";

/** A made-up picture: the PNG signature and a few invented bytes. The fake AI never looks at it. */
const SYNTHETIC_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("synthetic timetable picture"),
]);

const suggestion = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Suggested timetable" });

When("I upload a picture of my timetable", async ({ page }) => {
  await page.goto("/setup");
  await page
    .getByLabel("Suggest a grid from a picture of your timetable")
    .setInputFiles({
      name: "synthetic-timetable.png",
      mimeType: "image/png",
      buffer: SYNTHETIC_PNG,
    });
  await expect(suggestion(page)).toBeVisible();
});

When("I upload a file that is not a picture", async ({ page }) => {
  await page.goto("/setup");
  await page
    .getByLabel("Suggest a grid from a picture of your timetable")
    .setInputFiles({
      name: "notes.png",
      mimeType: "image/png",
      buffer: Buffer.from("this is only text"),
    });
});

Then(
  "the suggested grid sits beside my timetable with {int} changed cells marked",
  async ({ page }, n: number) => {
    const grid = suggestion(page);
    await expect(grid).toContainText(`${n} cells differ from your timetable.`);
    // each changed cell is marked in both grids
    await expect(grid.locator('td[data-changed="true"]')).toHaveCount(n * 2);
    await expect(
      grid.getByRole("table", { name: "Week 1, current" }),
    ).toBeVisible();
    await expect(
      grid.getByRole("table", { name: "Week 1, suggested" }),
    ).toBeVisible();
    await expect(grid).toContainText("IB H (607)");
    await expect(grid).toContainText("Changed: was 13 5 (504)");
  },
);

Then(
  "Claude lists the cell it could not read: {string}",
  async ({ page }, text: string) => {
    await expect(
      suggestion(page).getByRole("listitem").filter({ hasText: text }),
    ).toBeVisible();
  },
);

async function stored(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/timetable");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    versions: {
      entries: {
        week: string;
        weekday: number;
        period: number;
        groupId: string;
        room: string | null;
      }[];
    }[];
  };
  return (body.versions[0]?.entries ?? []).filter(
    (e) => e.week === "W1" && e.weekday === 2 && e.period === 1,
  );
}

Then(
  "the stored timetable still has 13 5 in Week 1 Tuesday period 1",
  async ({ request }) => {
    expect((await stored(request)).map((e) => e.groupId)).toEqual(["13 5"]);
  },
);

Then(
  "the stored timetable has no lesson in Week 1 Tuesday period 1",
  async ({ request }) => {
    expect(await stored(request)).toEqual([]);
  },
);

When("I accept the suggested grid", async ({ page }) => {
  await suggestion(page).getByRole("button", { name: "Accept" }).click();
});

When("I reject the suggested grid", async ({ page }) => {
  await suggestion(page).getByRole("button", { name: "Reject" }).click();
});

Then(
  "Week 1 Tuesday period 1 is empty and Week 1 Monday period 1 has room 607",
  async ({ page }) => {
    await expect(suggestion(page)).toHaveCount(0);
    await expect(
      page.getByLabel("Week 1, Tuesday, period 1", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("Week 1, Monday, period 1, room", { exact: true }),
    ).toHaveValue("607");
  },
);

Then("no suggested grid is left on the page", async ({ page }) => {
  await expect(suggestion(page)).toHaveCount(0);
});

Then("I am told it is not really a PNG file", async ({ page }) => {
  await expect(page.getByRole("alert")).toContainText(
    "That file is not really a .png file, so it was not attached.",
  );
});
