// The browser steps of features/m2-checkin.feature.
import {
  type APIRequestContext,
  expect,
  type Page,
  type Request,
} from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";
import { boardCells, proposalDialog, resetTo } from "../support/plan.ts";

/** "2026-11-16" as "Monday 16 November", the way the page words a day. */
const dayWords = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

const LAST_WEEK = "2026-11-16";
const checkIn = (page: Page) =>
  page.getByRole("region", { name: "Did these happen as planned?" });
const weekOf = (page: Page, monday: string) =>
  checkIn(page).getByRole("region", {
    name: `Week of ${dayWords(monday)}`,
  });

interface Waiting {
  weeks: {
    weekOf: string;
    lessons: {
      groupId: string;
      lessonId: string;
      slotKey: string;
      date: string;
    }[];
  }[];
}
async function waiting(request: APIRequestContext): Promise<Waiting> {
  const res = await request.get("/api/checkin");
  expect(res.ok()).toBe(true);
  return res.json();
}

/** What the board shows for one group's lessons in one week: "label | description". */
async function boardOf(page: Page, groupId: string, monday: string) {
  const lessons = (await boardCells(page)).filter((c) =>
    c.startsWith(`${groupId}, `),
  );
  // Friday 20 November is today: it is not a past lesson, so it is not in the check-in
  const days = [0, 1, 2, 3].map((n) => {
    const d = new Date(`${monday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return dayWords(d.toISOString().slice(0, 10));
  });
  return lessons.filter((c) => days.some((d) => c.includes(`, ${d}, `)));
}

Given(
  "last week's lessons have not been confirmed",
  async ({ page, request }) => {
    await resetTo(request, "m2-planned");
    await page.goto("/");
    await expect(weekOf(page, LAST_WEEK)).toBeVisible();
  },
);

Given(
  "three weeks of lessons have not been confirmed",
  async ({ page, request }) => {
    await resetTo(request, "m2-planned");
    await page.goto("/");
    await expect(checkIn(page).getByRole("heading", { level: 3 })).toHaveCount(
      3,
    );
  },
);

When(
  "I confirm last week for {word} {int}",
  async ({ page }, year: string, n: number) => {
    await weekOf(page, LAST_WEEK)
      .getByRole("button", { name: new RegExp(`^Confirm ${year} ${n}\\b`) })
      .click();
  },
);

/** Every lesson of the group that week is shown in this state; polled, since the board fills in after it loads. */
async function expectWeekShownAs(
  page: Page,
  groupId: string,
  states: RegExp,
): Promise<void> {
  await expect
    .poll(async () => {
      const cells = await boardOf(page, groupId, LAST_WEEK);
      return cells.length > 0 && cells.every((c) => states.test(c));
    })
    .toBe(true);
}

Then(
  "{word} {int}'s lessons for that week are shown as taught on the board",
  async ({ page }, year: string, n: number) => {
    await page.goto("/board");
    await expectWeekShownAs(page, `${year} ${n}`, /, taught$/);
  },
);

Then(
  "{word} {int}'s lessons for that week are still only assumed",
  async ({ page }, year: string, n: number) => {
    await expectWeekShownAs(page, `${year} ${n}`, /, assumed taught$/);
  },
);

Then(
  "{word} {int} no longer appears in the check-in for that week",
  async ({ page }, year: string, n: number) => {
    const week = weekOf(page, LAST_WEEK);
    await expect(week).toBeVisible();
    await expect(
      week.getByRole("heading", { level: 4, name: `${year} ${n}` }),
    ).toHaveCount(0);
    // the other groups are still waiting
    await expect(
      week.getByRole("heading", { level: 4, name: "13 3" }),
    ).toBeVisible();
  },
);

Then(
  "the check-in says {string} with the focus on it",
  async ({ page }, text: string) => {
    // said on the page the confirm was made on, so look at it before leaving
    const line = page.getByRole("status").filter({ hasText: text });
    await expect(line).toHaveText(text);
    await expect(line).toBeFocused();
  },
);

let posted: Promise<Request> | null = null;
/** The lesson she marked, as its button named it: "Not as planned: 13 3, Demand, Monday 26 October". */
let marked = "";
When(
  "I mark one of {word} {int}'s lessons as skipped with the note {string}",
  async ({ page, request }, year: string, n: number, note: string) => {
    // the first lesson of that group in the first week, as the planner lists it
    const [week] = (await waiting(request)).weeks;
    const mine = week?.lessons.find((l) => l.groupId === `${year} ${n}`);
    expect(mine).toBeDefined();
    marked = `${dayWords(mine?.date ?? "")}, period ${mine?.slotKey.split("|")[2]}`;
    posted = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/api/checkin"),
    );
    const first = weekOf(page, "2026-10-26")
      .getByRole("listitem")
      .filter({
        has: page.getByRole("heading", { level: 4, name: `${year} ${n}` }),
      });
    const button = first
      .getByRole("button", { name: /^Not as planned/ })
      .first();
    await button.click();
    const form = page.getByRole("group", { name: /^What happened to/ });
    await form.getByRole("radio", { name: "Skipped" }).check();
    await form.getByLabel("Note (optional)").fill(note);
    await checkIn(page).getByRole("button", { name: "Save answer" }).click();
  },
);

Then(
  "I see that the plan is out of date and can preview the change",
  async ({ page }) => {
    const banner = page.getByRole("region", {
      name: "The plan is out of date",
    });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "See what changes" }).click();
    const dialog = proposalDialog(page);
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      "Proposal: Re-plan on 2026-11-20",
    );
  },
);

Then("the note was saved with the answer", async () => {
  const body = (await posted)?.postDataJSON() as {
    entries: { groupId: string; outcome: string; note: string | null }[];
  };
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0]).toMatchObject({
    groupId: "13 3",
    outcome: "skipped",
    note: "Fire drill",
  });
});

Then(
  "the preview labels the skipped lesson as a correction",
  async ({ page }) => {
    const changes = proposalDialog(page).getByRole("region", {
      name: "Changes for 13 3",
    });
    await expect(
      changes.getByRole("listitem").filter({ hasText: "did not happen on" }),
    ).toHaveCount(1);
    await expect(
      changes.getByRole("listitem").filter({
        hasText: `did not happen on ${marked}`,
      }),
    ).toHaveCount(1);
  },
);

Then("the check-in shows three weeks, oldest first", async ({ page }) => {
  await expect(checkIn(page).getByRole("heading", { level: 3 })).toHaveText([
    `Week of ${dayWords("2026-10-26")}`,
    `Week of ${dayWords("2026-11-09")}`,
    `Week of ${dayWords(LAST_WEEK)}`,
  ]);
});

Then(
  "every waiting lesson is listed under its own week",
  async ({ page, request }) => {
    const { weeks } = await waiting(request);
    expect(weeks).toHaveLength(3);
    for (const w of weeks)
      await expect(
        weekOf(page, w.weekOf).getByRole("button", { name: /^Not as planned/ }),
      ).toHaveCount(w.lessons.length);
  },
);

Then("Today still shows today's lessons above it", async ({ page }) => {
  const lessons = page.getByRole("table", {
    name: "Today's lessons in period order",
  });
  await expect(lessons.getByRole("row")).not.toHaveCount(1);
  const above = await lessons.boundingBox();
  const below = await checkIn(page).boundingBox();
  expect(above).not.toBeNull();
  expect(below).not.toBeNull();
  expect((above?.y ?? 0) + (above?.height ?? 0)).toBeLessThanOrEqual(
    below?.y ?? 0,
  );
});

When("I confirm every group in every week", async ({ page, request }) => {
  const buttons = checkIn(page).getByRole("button", { name: /^Confirm / });
  // each confirm refreshes the lists, so take the first one that is left
  for (let left = await buttons.count(); left > 0; left--) {
    await buttons.first().click();
    await expect(buttons).toHaveCount(left - 1);
  }
  expect((await waiting(request)).weeks).toEqual([]);
});

Then("the check-in says {string}", async ({ page }, text: string) => {
  await expect(checkIn(page)).toContainText(text);
  await expect(checkIn(page).getByRole("heading", { level: 3 })).toHaveCount(0);
});

When(
  "I open the form for a lesson that did not go as planned",
  async ({ page }) => {
    await expect(checkIn(page)).toBeVisible();
    await checkIn(page)
      .getByRole("button", { name: /^Not as planned/ })
      .first()
      .click();
    await expect(
      page.getByRole("group", { name: /^What happened to/ }),
    ).toBeVisible();
  },
);

/** 13 3's lessons on Thursday 12 November, by period: a double. */
async function doubleOf(request: APIRequestContext) {
  const { weeks } = await waiting(request);
  const lessons = weeks
    .flatMap((w) => w.lessons)
    .filter((l) => l.groupId === "13 3" && l.date === "2026-11-12")
    .sort((a, b) => a.slotKey.localeCompare(b.slotKey));
  expect(lessons).toHaveLength(2);
  return lessons;
}
const doubleButtons = (page: Page) =>
  weekOf(page, "2026-11-09").getByRole("button", {
    name: /^Not as planned: 13 3, .*Thursday 12 November/,
  });

Then(
  "13 3's double on 12 November has two buttons with different names",
  async ({ page }) => {
    await expect(doubleButtons(page)).toHaveCount(2);
    const names = await doubleButtons(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")),
    );
    expect(new Set(names).size).toBe(2);
  },
);

let laterId = "";
When(
  "I mark the later half of that double as skipped",
  async ({ page, request }) => {
    const [, later] = await doubleOf(request);
    laterId = later?.lessonId ?? "";
    posted = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/api/checkin"),
    );
    const period = later?.slotKey.split("|")[2];
    await weekOf(page, "2026-11-09")
      .getByRole("button", {
        name: new RegExp(`^Not as planned: 13 3, .*period ${period}$`),
      })
      .click();
    await page
      .getByRole("group", { name: new RegExp(`period ${period}\\?$`) })
      .getByRole("radio", { name: "Skipped" })
      .check();
    await checkIn(page).getByRole("button", { name: "Save answer" }).click();
  },
);

Then("the answer is written for the later lesson only", async ({ request }) => {
  const body = (await posted)?.postDataJSON() as {
    entries: { groupId: string; lessonId: string }[];
  };
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0]).toMatchObject({ groupId: "13 3", lessonId: laterId });
  // the earlier half is the one still waiting
  await expect
    .poll(async () => {
      const left = (await waiting(request)).weeks
        .flatMap((w) => w.lessons)
        .filter((l) => l.groupId === "13 3" && l.date === "2026-11-12");
      return left.map((l) => l.lessonId);
    })
    .toHaveLength(1);
  const left = (await waiting(request)).weeks
    .flatMap((w) => w.lessons)
    .filter((l) => l.groupId === "13 3" && l.date === "2026-11-12");
  expect(left[0]?.lessonId).not.toBe(laterId);
});

let noteTyped = "";
When(
  "I open the form for 13 1's first lesson and type the note {string}",
  async ({ page }, note: string) => {
    noteTyped = note;
    await weekOf(page, "2026-10-26")
      .getByRole("button", { name: /^Not as planned: 13 1/ })
      .first()
      .click();
    const form = page.getByRole("group", { name: /^What happened to/ });
    await form.getByRole("radio", { name: "Skipped" }).check();
    await form.getByLabel("Note (optional)").fill(note);
  },
);

When("the planner refuses the next save", async ({ page }) => {
  await page.route("**/api/checkin", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 422,
          json: {
            error: {
              code: "invalid-checkin",
              message: "Nothing was saved from this check-in.",
              issues: ["That lesson is not waiting for an answer."],
            },
          },
        })
      : route.continue(),
  );
});

When("I save the answer", async ({ page }) => {
  await checkIn(page).getByRole("button", { name: "Save answer" }).click();
});

Then(
  "I am told it was refused and the form still holds my note",
  async ({ page }) => {
    await expect(checkIn(page).getByRole("alert")).toContainText(
      "Nothing was saved from this check-in.",
    );
    const form = page.getByRole("group", { name: /^What happened to/ });
    await expect(form.getByLabel("Note (optional)")).toHaveValue(noteTyped);
    await expect(form.getByRole("radio", { name: "Skipped" })).toBeChecked();
  },
);
