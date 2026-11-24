import { expect } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** "22 February 2027" as "2027-02-22". */
function isoOf(text: string): string {
  const [d, m, y] = text.split(" ");
  const month = MONTHS.indexOf(m ?? "") + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const week = (page: import("@playwright/test").Page, n: 1 | 2) =>
  page.getByRole("region", { name: new RegExp(`^Week ${n}`) });
const dateField = (page: import("@playwright/test").Page) =>
  page.getByLabel("Go to the fortnight with this date");

When("I open the board", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByRole("table").first()).toBeVisible();
});

When(
  "I go to the fortnight of {int} {word} {int}",
  async ({ page }, d, m, y) => {
    await dateField(page).fill(isoOf(`${d} ${m} ${y}`));
    await expect(page).toHaveURL(/w1=/);
    await expect(page.getByRole("table").first()).toBeVisible();
  },
);

When("I press {string}", async ({ page }, name: string) => {
  await page.getByRole("button", { name, exact: true }).click();
});

Then(
  "Week 1 starts on {int} {word} {int} and Week 2 on {int} {word} {int}",
  async ({ page }, d1, m1, y1, d2, m2, y2) => {
    await expect(week(page, 1)).toContainText(`Monday ${d1} ${m1} ${y1}`);
    await expect(week(page, 2)).toContainText(`Monday ${d2} ${m2} ${y2}`);
  },
);

Then("Week 2 shows lessons on Monday and Tuesday only", async ({ page }) => {
  const lessons = week(page, 2).locator('td[data-kind="lesson"]');
  await expect(lessons.first()).toBeVisible();
  const dates = await lessons.evaluateAll((cells) => [
    ...new Set(cells.map((c) => c.getAttribute("data-date"))),
  ]);
  expect(dates.sort()).toEqual(["2026-12-21", "2026-12-22"]);
});

Then("Week 2 is marked {string}", async ({ page }, chip: string) => {
  await expect(week(page, 2).getByText(chip, { exact: true })).toBeVisible();
});

// The steps of features/01-cycle-from-calendar.feature in the browser.
Given(
  "12 Feb 2027 is labelled Week 2 and 15 to 19 Feb are school holidays",
  async ({ request }) => {
    const res = await request.get(
      "/api/calendar/days?from=2027-02-12&to=2027-02-19",
    );
    const days = (await res.json()) as {
      date: string;
      weekLabel: string | null;
      pupilDay: boolean;
    }[];
    expect(days.find((d) => d.date === "2027-02-12")?.weekLabel).toBe("W2");
    expect(days.filter((d) => d.date >= "2027-02-15" && d.pupilDay)).toEqual(
      [],
    );
  },
);

When("I open the week of 22 Feb", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByRole("table").first()).toBeVisible();
  await dateField(page).fill("2027-02-22");
  await expect(page).toHaveURL(/w1=2027-02-22/);
});

Then("it is Week 1", async ({ page }) => {
  const left = page.getByRole("region", { name: "Week 1", exact: true });
  await expect(left).toContainText("Monday 22 February 2027");
});

Then("each group has its Week 1 lessons", async ({ page, request }) => {
  const timetable = (await (await request.get("/api/timetable")).json()) as {
    versions: { entries: { week: string; groupId: string }[] }[];
  };
  const expected = new Map<string, number>();
  for (const e of timetable.versions[0]?.entries ?? [])
    if (e.week === "W1")
      expected.set(e.groupId, (expected.get(e.groupId) ?? 0) + 1);
  expect(expected.get("13 1")).toBe(3);
  const left = week(page, 1);
  // A double is one drawn cell spanning two rows, so count periods, not cells.
  const periods = await left
    .locator('td[data-kind="lesson"]')
    .evaluateAll((cells) =>
      cells.map((c) => [
        (c.getAttribute("aria-label") ?? "").split(", ")[0],
        (c as HTMLTableCellElement).rowSpan,
      ]),
    );
  for (const [group, count] of expected)
    expect(
      periods
        .filter(([g]) => g === group)
        .reduce((n, [, span]) => n + Number(span), 0),
    ).toBe(count);
});

Then("both week tables cover five days in every row", async ({ page }) => {
  for (const n of [1, 2] as const) {
    // For each body row: cells starting there plus cells reaching down from above.
    const rows = await week(page, n)
      .locator("tbody tr")
      .evaluateAll((trs) => {
        const reach: number[] = [];
        return trs.map((tr, r) => {
          let covered = reach[r] ?? 0;
          for (const td of Array.from(tr.querySelectorAll("td"))) {
            covered += 1;
            const span = (td as HTMLTableCellElement).rowSpan;
            for (let k = 1; k < span; k++)
              reach[r + k] = (reach[r + k] ?? 0) + 1;
          }
          return covered;
        });
      });
    expect(rows).toEqual([5, 5, 5, 5, 5, 5]);
  }
});

Then("there is a cell named {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
});

Then(
  "Tuesday 8 December 2026 is a day without lessons that says {string}",
  async ({ page }, text: string) => {
    const cells = page.locator('td[data-date="2026-12-08"]');
    await expect(cells).toHaveCount(1);
    await expect(cells).toHaveAttribute("data-kind", "no-school");
    await expect(cells).toContainText(text);
  },
);
