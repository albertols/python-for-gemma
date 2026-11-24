import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";

/** Today's date is fixed by the harness, so a different "today" is answered by the page's own request. */
async function sayTodayIs(page: Page, body: Record<string, unknown>) {
  await page.route("**/api/today", (route) =>
    route.fulfill({
      json: { weekLabel: null, lessons: [], reminders: [], ...body },
    }),
  );
}

Given("the planner says today is Monday 12 October 2026", async ({ page }) => {
  await sayTodayIs(page, {
    date: "2026-10-12",
    kind: "unlabelled",
    nextTeachingDay: "2026-10-13",
  });
});

Given(
  "the planner says today is Tuesday 8 December 2026, a labelled holiday",
  async ({ page }) => {
    await sayTodayIs(page, {
      date: "2026-12-08",
      kind: "holiday",
      weekLabel: "W2",
      nextTeachingDay: "2026-12-09",
    });
  },
);

Given("the planner has no calendar yet", async ({ page }) => {
  await sayTodayIs(page, {
    date: "2026-11-20",
    kind: "no-calendar",
    nextTeachingDay: null,
  });
});

// "I open the app" is in shell.steps.ts.

Then(
  "I see {string} and {string}",
  async ({ page }, first: string, second: string) => {
    const main = page.getByRole("main");
    await expect(main).toContainText(first);
    await expect(main).toContainText(second);
  },
);

Then("I see {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("main")).toContainText(text);
});

Then(
  "I see the lesson {string} at {word} in room {int}",
  async ({ page }, group: string, time: string, room: number) => {
    const row = page
      .getByRole("row")
      .filter({ hasText: group })
      .filter({ hasText: time });
    await expect(row).toContainText(`Room ${room}`);
  },
);

Then(
  "the next teaching day, Tuesday 13 October 2026, links to its fortnight on the board",
  async ({ page, request }) => {
    const fortnights = (await (
      await request.get("/api/fortnights")
    ).json()) as {
      w1: string | null;
      w2: string | null;
    }[];
    // A fortnight runs from its first Monday to the Sunday ending its second week.
    const addDays = (iso: string, n: number) =>
      new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const first = fortnights.find((f) => {
      const start = f.w1 ?? f.w2 ?? "";
      const end = addDays(f.w2 ?? f.w1 ?? "", 6);
      return start <= "2026-10-13" && "2026-10-13" <= end;
    });
    const mondayOf = first?.w1 ?? first?.w2;
    expect(mondayOf).toBeTruthy();
    const link = page
      .getByRole("main")
      .getByRole("link", { name: /Tuesday 13 October 2026/ });
    await expect(link).toHaveAttribute("href", `/board?w1=${mondayOf}`);
  },
);

Then("I see one action {string}", async ({ page }, name: string) => {
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name })).toBeVisible();
  await expect(main.getByRole("link")).toHaveCount(1);
  await expect(main.getByRole("button")).toHaveCount(0);
});

// features/15-report-reminder.feature, in the browser.
Given(
  "the Year 11 long-report data deadline is 30 Nov 2026",
  async ({ request }) => {
    const res = await request.get("/api/today");
    const today = (await res.json()) as {
      reminders: { label: string; date: string; daysLeft: number }[];
    };
    const reminder = today.reminders.find((r) =>
      r.label.startsWith("Year 11 Report 2: Long"),
    );
    expect(reminder?.date).toBe("2026-11-30");
  },
);

When("I open Today on 20 Nov", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Friday 20 November 2026",
  );
});

Then("the reminder is shown with the days remaining", async ({ page }) => {
  const item = page
    .getByRole("listitem")
    .filter({ hasText: "Year 11 Report 2: Long: data deadline" });
  await expect(item).toContainText("in 10 days");
});

// The slot audit.
When("I open the slot audit", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("table").first()).toBeVisible();
});

type Audit = {
  rows: { perGroup: Record<string, { open: number; cover: number }> }[];
};
const taught = (c: { open: number; cover: number } | undefined) =>
  (c?.open ?? 0) + (c?.cover ?? 0);

Then(
  "I see lessons per group for each teaching block",
  async ({ page, request }) => {
    const audit = (await (await request.get("/api/audit")).json()) as Audit;
    const groups = Object.keys(audit.rows[0]?.perGroup ?? {});
    expect(audit.rows.length).toBeGreaterThan(0);
    const table = page.getByRole("table", { name: /lessons per group/i });
    const blocks = table.locator("tbody tr");
    await expect(blocks).toHaveCount(audit.rows.length);
    const headers = await table.locator("thead th").allTextContents();
    expect(headers).toEqual(["Teaching block", ...groups]);
    // Every block row shows open plus cover lessons for each group, in column order.
    for (const [i, row] of audit.rows.entries())
      await expect(blocks.nth(i).locator("td")).toHaveText(
        groups.map((g) => new RegExp(`^${taught(row.perGroup[g])}$`)),
      );
    // The year total is the sum of the blocks.
    await expect(
      table.getByRole("rowheader", { name: "Year total" }),
    ).toBeVisible();
    await expect(table.locator("tfoot td")).toHaveText(
      groups.map(
        (g) =>
          new RegExp(
            `^${audit.rows.reduce((n, r) => n + taught(r.perGroup[g]), 0)}$`,
          ),
      ),
    );
  },
);

Then("I see the audit's guiding sentence", async ({ page }) => {
  await expect(page.getByRole("main")).toContainText(
    "Compare these counts with your own timetable. If one is wrong, a date is wrong.",
  );
});

async function seeDayOff(
  page: Page,
  request: APIRequestContext,
  iso: string,
  heading: string,
  text: string,
) {
  const audit = (await (await request.get("/api/audit")).json()) as {
    daysOff: {
      date: string;
      wouldHaveHad: { groupId: string; period: number }[];
    }[];
  };
  const off = audit.daysOff.find((d) => d.date === iso);
  expect(off?.wouldHaveHad.length).toBeGreaterThan(0);
  const item = page.getByRole("listitem").filter({ hasText: heading });
  await expect(item).toContainText(text);
  for (const m of off?.wouldHaveHad ?? [])
    await expect(item).toContainText(`${m.groupId}, period ${m.period}`);
}

Then(
  "I see that Monday 12 October 2026 was {string} and what each group missed",
  ({ page, request }, text: string) =>
    seeDayOff(page, request, "2026-10-12", "Monday 12 October 2026", text),
);

Then(
  "I see that Tuesday 8 December 2026 was {string} and what each group missed",
  ({ page, request }, text: string) =>
    seeDayOff(page, request, "2026-12-08", "Tuesday 8 December 2026", text),
);

Then("I see that no lessons have been lost", async ({ page }) => {
  await expect(page.getByRole("main")).toContainText(
    "No lessons have been cancelled",
  );
});
