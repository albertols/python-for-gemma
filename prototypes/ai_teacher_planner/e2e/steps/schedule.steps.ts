// The browser steps of features/05-schedule-from-documents.feature (spec section 17,
// scenario 5), on the course "m2-planned" seeds: the synthetic scheme with its
// 13 teaching lessons, accepted for 13 1, 13 3 and 13 5 on 20 November 2026.
// The engine steps (apps/api/src/usecases/schedule.steps.test.ts) prove the plan;
// these read what the board and the scheme screen say. Every read waits for the
// words it needs to be on screen first, so no step reads text once and hopes.
import { expect, type Page } from "@playwright/test";
import { Given, Then, When } from "../support/fixtures.ts";
import { COURSE, resetTo, YEAR_13 } from "../support/plan.ts";

/** The two fortnights that hold the whole plan, 16 November to 11 December. */
const FORTNIGHTS = ["2026-11-16", "2026-11-30"] as const;
/** The chapters of the synthetic scheme, in her teaching order. */
const CHAPTERS = ["Demand", "Supply", "Markets", "Prices"];
/** 13 3's spare lesson before its 20-mark test (Task 2.12's report), and the test. */
const SPARE = { date: "2026-11-26", period: 4, group: "13 3" };

interface Cell {
  date: string;
  period: number;
  group: string;
  /** What a reader hears for the lesson: "Markets, 3 of 4, planned". */
  words: string;
}

/**
 * Opens the fortnight and waits for its last words before reading: the cards
 * arrive after the grid, so the final lesson of the fortnight is the signal.
 */
async function openFortnight(page: Page, w1: string, lastWords: string) {
  await page.goto(`/board?w1=${w1}`);
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(
    page.locator('td[data-kind="lesson"][data-state]').last(),
  ).toBeVisible();
  await expect(
    page
      .locator('td[data-kind="lesson"]')
      .filter({ hasText: lastWords })
      .last(),
  ).toBeVisible();
}

async function readCards(page: Page): Promise<Cell[]> {
  return page.locator('td[data-kind="lesson"][data-state]').evaluateAll((cs) =>
    cs.map((c) => ({
      date: c.getAttribute("data-date") ?? "",
      period: Number(c.getAttribute("data-period")),
      group: (c.getAttribute("aria-label") ?? "").split(",")[0] ?? "",
      words:
        document.getElementById(c.getAttribute("aria-describedby") ?? "")
          ?.textContent ?? "",
    })),
  );
}

/** Every Year 13 card of both fortnights, in the order of the calendar. */
async function schedule(page: Page): Promise<Cell[]> {
  const all: Cell[] = [];
  await openFortnight(page, FORTNIGHTS[0], "20 mark");
  all.push(...(await readCards(page)));
  await openFortnight(page, FORTNIGHTS[1], "Spare lesson");
  all.push(...(await readCards(page)));
  return all
    .filter((c) => YEAR_13.includes(c.group))
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
}

Given(
  "the calendar, my timetable and the IAL Unit 4 scheme with my class counts",
  async ({ request }) => {
    await resetTo(request, "m2-planned");
  },
);

When("I choose 13 1, 13 3 and 13 5 and my teaching order", async ({ page }) => {
  // the groups and the order were chosen by the seed; the board shows them
  await openFortnight(page, FORTNIGHTS[0], "20 mark");
  for (const group of YEAR_13)
    await expect(
      page.locator(`td[aria-label^="${group},"][data-state]`).first(),
    ).toBeVisible();
});

Then(
  "I see a dated schedule per group in which every lesson sits on a real lesson of that group",
  async ({ page, request }) => {
    const cards = await schedule(page);
    const timetable = (await (await request.get("/api/timetable")).json()) as {
      versions: {
        entries: {
          week: string;
          weekday: number;
          period: number;
          groupId: string;
        }[];
      }[];
    };
    const entries = timetable.versions[0]?.entries ?? [];
    const days = (await (
      await request.get("/api/calendar/days?from=2026-11-16&to=2026-12-11")
    ).json()) as { date: string; weekLabel: string | null }[];
    const label = new Map(days.map((d) => [d.date, d.weekLabel]));
    for (const group of YEAR_13)
      expect(cards.filter((c) => c.group === group).length).toBeGreaterThan(0);
    for (const c of cards) {
      const weekday = new Date(`${c.date}T00:00:00Z`).getUTCDay() || 7;
      expect(
        entries.some(
          (e) =>
            e.groupId === c.group &&
            e.week === label.get(c.date) &&
            e.weekday === weekday &&
            e.period === c.period,
        ),
        `${c.group} has no lesson on ${c.date}, period ${c.period}`,
      ).toBe(true);
    }
  },
);

Then("no lesson falls on a holiday", async ({ page }) => {
  // the half-term week, 2 to 6 November, is not drawn at all: the fortnight jumps over it
  await page.goto("/board?w1=2026-11-02");
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByRole("region", { name: /^Week 2/ })).toContainText(
    "Monday 9 November",
  );
  for (const day of ["02", "03", "04", "05", "06"])
    await expect(page.locator(`td[data-date="2026-11-${day}"]`)).toHaveCount(0);
  // Tuesday 8 December is an official holiday: one cell says so and no lesson sits on it
  await openFortnight(page, FORTNIGHTS[1], "Spare lesson");
  const holiday = page.locator(
    'td[data-kind="no-school"][data-date="2026-12-08"]',
  );
  await expect(holiday).toHaveText("Official holiday");
  await expect(
    page.locator('td[data-kind="lesson"][data-date="2026-12-08"]'),
  ).toHaveCount(0);
});

Then("chapter order is kept", async ({ page, request }) => {
  const cards = await schedule(page);
  const scheme = (await (
    await request.get(`/api/scheme/${COURSE}`)
  ).json()) as {
    items: { title: string; kind: string }[];
  };
  expect(
    scheme.items.filter((i) => i.kind === "teaching").map((i) => i.title),
  ).toEqual(CHAPTERS);
  for (const group of YEAR_13) {
    // "Markets, 3 of 4, planned": the chapter and the lesson of it, read from the board
    const reading = cards
      .filter((c) => c.group === group)
      .flatMap((c) => {
        const m = /^(.+?), (\d+) of \d+, /.exec(c.words);
        const chapter = CHAPTERS.indexOf(m?.[1] ?? "");
        return m && chapter >= 0 ? [chapter * 100 + Number(m[2])] : [];
      });
    expect(reading.length).toBeGreaterThan(3);
    expect(reading).toEqual([...reading].sort((a, b) => a - b));
  }
});

Then("each chapter shows its spec reference", async ({ page }) => {
  await page.goto(`/scheme/${COURSE}`);
  const table = page.getByRole("table", { name: "Scheme of work" });
  for (const chapter of CHAPTERS) {
    const row = table.getByRole("row", { name: new RegExp(`^${chapter}\\b`) });
    await expect(row).toContainText(/Spec points \d+\.\d+/);
    await expect(row).not.toContainText("not linked to the specification");
  }
});

Then("the teaching-lesson total matches my sheet", async ({ page }) => {
  await page.goto(`/scheme/${COURSE}`);
  const totals = page.getByRole("region", { name: "Totals for each group" });
  // the synthetic sheet states 10 and its four chapters add up to 13; the plan follows the chapters
  for (const group of YEAR_13)
    await expect(
      totals
        .getByRole("listitem")
        .filter({ hasText: new RegExp(`^${group}:`) }),
    ).toContainText("13 teaching");
});

Then(
  "spare lessons appear as flex lessons before each assessment",
  async ({ page }) => {
    const cards = await schedule(page);
    // the spare lesson is in the first fortnight
    await openFortnight(page, FORTNIGHTS[0], "20 mark");
    const spare = page.locator(
      `td[data-date="${SPARE.date}"][data-period="${SPARE.period}"]`,
    );
    await expect(spare).toHaveAccessibleDescription("Spare lesson, planned");
    await expect(spare).toHaveAttribute("aria-label", /^13 3,/);
    // the next lesson of 13 3 after the spare one is its 20-mark test
    const own = cards.filter((c) => c.group === SPARE.group);
    const at = own.findIndex(
      (c) => c.date === SPARE.date && c.period === SPARE.period,
    );
    expect(at).toBeGreaterThanOrEqual(0);
    expect(own[at + 1]?.words).toBe("20 mark, Assessment, whole lesson");
  },
);
