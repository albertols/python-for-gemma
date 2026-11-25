import { expect, type Page } from "@playwright/test";
import {
  fitFor,
  type PlanInputs,
  type SowItem,
} from "../../packages/domain/src/index.ts";
import { Given, Then, When } from "../support/fixtures.ts";

const TEST = { "x-planner-test": "1" };
const COURSE = "ial-business-u4";
const GROUPS = ["13 1", "13 3", "13 5"];

const table = (page: Page) =>
  page.getByRole("table", { name: "Scheme of work" });
const rowOf = (page: Page, title: string) =>
  table(page).getByRole("row", { name: new RegExp(`^${title}\\b`) });
const lessonsField = (page: Page, title: string) =>
  page.getByRole("spinbutton", { name: `Lessons for ${title}`, exact: true });
const totalsOf = (page: Page) =>
  page.getByRole("region", { name: "Totals for each group" });
const suggestionRows = (page: Page) =>
  table(page).getByRole("row", { name: /^Suggestion for / });

/** The teaching total shown for each group, from the totals bar. */
async function teachingTotals(page: Page): Promise<number[]> {
  const out: number[] = [];
  for (const group of GROUPS) {
    const text = await totalsOf(page)
      .getByRole("listitem")
      .filter({ hasText: new RegExp(`^${group}:`) })
      .textContent();
    out.push(Number(/(\d+) teaching/.exec(text ?? "")?.[1]));
  }
  return out;
}

const storedScheme = async (
  request: import("@playwright/test").APIRequestContext,
) =>
  (await (await request.get(`/api/scheme/${COURSE}`)).json()) as {
    items: SowItem[];
    overrides: unknown[];
  };
const lessonsStored = async (
  request: import("@playwright/test").APIRequestContext,
  title: string,
) =>
  (await storedScheme(request)).items.find((i) => i.title === title)?.lessons;

Given(
  "the planner holds a planned scheme of work",
  async ({ request, page }) => {
    const reset = await request.post("/api/test/reset", {
      headers: TEST,
      data: { state: "m2-planned" },
    });
    expect(reset.ok()).toBe(true);
    await page.goto(`/scheme/${COURSE}`);
    await expect(
      page.getByRole("heading", { level: 1, name: /Scheme of work/ }),
    ).toBeVisible();
    await expect(rowOf(page, "Markets")).toBeVisible();
  },
);

Given(
  "I have saved {int} lessons for {string}",
  async ({ request, page }, n: number, title: string) => {
    const scheme = await storedScheme(request);
    const items = scheme.items.map((i) =>
      i.title === title ? { ...i, lessons: n } : i,
    );
    const res = await request.put(`/api/scheme/${COURSE}`, {
      data: { items, overrides: scheme.overrides },
    });
    expect(res.status()).toBe(200);
    await page.reload();
    await expect(lessonsField(page, title)).toHaveValue(String(n));
  },
);

When(
  "I change the chapter {string} from {int} lessons to {int}",
  async ({ page }, title: string, from: number, to: number) => {
    await expect(lessonsField(page, title)).toHaveValue(String(from));
    // no request at all may leave the page while she types: the totals come from her edit
    const requests: string[] = [];
    page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
    await page.evaluate(() => {
      (window as unknown as { __kept: number }).__kept = 1;
    });
    const before = await teachingTotals(page);
    stash.set(page, { before, requests });
    await lessonsField(page, title).fill(String(to));
  },
);
const stash = new WeakMap<Page, { before: number[]; requests: string[] }>();

Then(
  "the teaching total goes up by 2 for every group without the page reloading",
  async ({ page }) => {
    const kept = stash.get(page);
    if (!kept) throw new Error("the edit step did not run");
    await expect
      .poll(() => teachingTotals(page))
      .toEqual(kept.before.map((n) => n + 2));
    expect(kept.before).toEqual([13, 13, 13]);
    expect(
      await page.evaluate(
        () => (window as unknown as { __kept?: number }).__kept,
      ),
    ).toBe(1);
    expect(kept.requests).toEqual([]);
  },
);

Then(
  "the chapter {string} shows {int} weeks for {word} {word}",
  async ({ page }, title: string, weeks: number, a: string, b: string) => {
    await expect(
      rowOf(page, title).getByRole("cell", {
        name: `${a} ${b}: ${weeks} weeks`,
      }),
    ).toBeVisible();
  },
);

When("I import the planning sheet", async ({ page }) => {
  await page
    .getByRole("button", { name: "Import from my planning sheet" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import from my planning sheet",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Planning sheet")).toContainText(
    "Synthetic Planning.xlsx",
  );
  await dialog.getByRole("button", { name: "Show preview" }).click();
});

const importDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Import from my planning sheet" });

When("I import the file {string}", async ({ page }, file: string) => {
  await page
    .getByRole("button", { name: "Import from my planning sheet" })
    .click();
  await importDialog(page)
    .getByLabel("Planning sheet")
    .selectOption({ label: `ial/Planning/${file}` });
  await importDialog(page)
    .getByRole("button", { name: "Show preview" })
    .click();
});

Then("the import says {string}", async ({ page }, sentence: string) => {
  await expect(importDialog(page).getByRole("alert")).toContainText(sentence);
});

Then(
  "the import shows no preview and offers nothing to accept",
  async ({ page }) => {
    await expect(importDialog(page)).not.toContainText("What would change");
    await expect(
      importDialog(page).getByRole("button", {
        name: "Use the imported scheme",
      }),
    ).toHaveCount(0);
  },
);

Then(
  "I see that the sheet states {int} but its chapters add up to {int}",
  async ({ page }, stated: number, sum: number) => {
    await expect(importDialog(page)).toContainText(
      `The sheet states a total of ${stated} classes, and its chapters add up to ${sum}.`,
    );
  },
);

Then(
  "the preview says {string} would change",
  async ({ page }, title: string) => {
    await expect(
      importDialog(page).getByRole("list", { name: "What would change" }),
    ).toContainText(`${title}: changed`);
  },
);

Then("nothing is saved until I accept", async ({ request }) => {
  expect(await lessonsStored(request, "Supply")).toBe(5);
});

When("I accept the import", async ({ page }) => {
  await importDialog(page)
    .getByRole("button", { name: "Use the imported scheme" })
    .click();
  await expect(importDialog(page)).toHaveCount(0);
});

Then(
  "{string} is saved with {int} lessons",
  async ({ request, page }, title: string, n: number) => {
    await expect.poll(() => lessonsStored(request, title)).toBe(n);
    await expect(lessonsField(page, title)).toHaveValue(String(n));
  },
);

When("I ask for lesson-count suggestions", async ({ page }) => {
  await page.getByRole("button", { name: "Suggest lesson counts" }).click();
  await expect(suggestionRows(page)).toHaveCount(1);
});

Then(
  "one chapter shows {string} with the AI badge and a reason",
  async ({ page }, change: string) => {
    const row = suggestionRows(page);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Markets");
    await expect(row).toContainText(change);
    await expect(
      row.getByRole("img", { name: "AI suggestion, not reviewed" }),
    ).toBeVisible();
    await expect(row).toContainText(
      "Demand and supply need a fifth lesson for worked examples before the first assessment.",
    );
  },
);

Then(
  "her number for {string} is still {int}",
  async ({ page, request }, title: string, n: number) => {
    await expect(lessonsField(page, title)).toHaveValue(String(n));
    expect(await lessonsStored(request, title)).toBe(n);
  },
);

When("I accept it", async ({ page }) => {
  await suggestionRows(page).getByRole("button", { name: "Accept" }).click();
});

When("I reject it", async ({ page }) => {
  await suggestionRows(page).getByRole("button", { name: "Reject" }).click();
});

Then("no suggestion is left on the page", async ({ page }) => {
  await expect(suggestionRows(page)).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^AI suggestion/ })).toHaveCount(
    0,
  );
});

Then(
  "the chapter {string} has {int} lessons and a small sparkle",
  async ({ page, request }, title: string, n: number) => {
    await expect(lessonsField(page, title)).toHaveValue(String(n));
    await expect(suggestionRows(page)).toHaveCount(0);
    await expect(
      rowOf(page, title).getByRole("img", {
        name: "AI suggestion, accepted",
      }),
    ).toBeVisible();
    expect(await lessonsStored(request, title)).toBe(n);
  },
);

When(
  "I add {int} lessons to the chapter {string}",
  async ({ page }, extra: number, title: string) => {
    const field = lessonsField(page, title);
    const was = Number(await field.inputValue());
    await field.fill(String(was + extra));
  },
);

Then(
  "each group's total shows how many lessons do not fit",
  async ({ page, request }) => {
    const inputs = (await (
      await request.get(`/api/plans/${COURSE}/inputs`)
    ).json()) as PlanInputs;
    const prices = inputs.items.map((i) =>
      i.title === "Prices" ? { ...i, lessons: i.lessons + 200 } : i,
    );
    const expected = fitFor({ ...inputs, items: prices });
    expect(expected.every((g) => g.over > 0)).toBe(true);
    for (const g of expected) {
      const item = totalsOf(page)
        .getByRole("listitem")
        .filter({ hasText: new RegExp(`^${g.groupId}:`) });
      await expect(item).toContainText(`${g.over} lessons do not fit`);
    }
  },
);

When(
  "I move the chapter {string} up with the keyboard",
  async ({ page }, title: string) => {
    const button = page.getByRole("button", { name: `Move up ${title}` });
    await button.focus();
    await page.keyboard.press("Enter");
  },
);

const order = async (page: Page) =>
  table(page)
    .getByRole("row")
    .evaluateAll((rows) =>
      rows.map((r) => r.getAttribute("data-item") ?? "").filter((x) => x),
    );

Then(
  "{string} comes before the 12 mark assessment",
  async ({ page }, title: string) => {
    const ids = await order(page);
    const prices = ids.indexOf("ch4");
    expect(title).toBe("Prices");
    expect(prices).toBeGreaterThan(-1);
    expect(prices).toBeLessThan(ids.indexOf("a-ch3"));
  },
);

When("I save the scheme", async ({ page }) => {
  await page.getByRole("button", { name: "Save scheme" }).click();
  await expect(
    page.getByRole("button", { name: "Save scheme" }),
  ).toBeDisabled();
});

When("I reload the scheme page", async ({ page }) => {
  await page.reload();
  await expect(rowOf(page, "Markets")).toBeVisible();
});

When("I add a chapter and a project", async ({ page }) => {
  await page.getByLabel("Kind of item to add").selectOption("teaching");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Kind of item to add").selectOption("project");
  await page.getByRole("button", { name: "Add item" }).click();
});

Then(
  "the new chapter says it is not linked to the specification",
  async ({ page }) => {
    await expect(rowOf(page, "New chapter")).toContainText(
      "not linked to the specification",
    );
  },
);

Then("the new project does not", async ({ page }) => {
  await expect(rowOf(page, "New project")).toBeVisible();
  await expect(rowOf(page, "New project")).not.toContainText(
    "not linked to the specification",
  );
});

When(
  "I set the revision weeks to {int} and save them",
  async ({ page }, n: number) => {
    await page.getByLabel("Weeks of revision before the exam").fill(String(n));
    await page.getByRole("button", { name: "Save revision weeks" }).click();
    await expect(
      page.getByRole("button", { name: "Save revision weeks" }),
    ).toBeDisabled();
  },
);

Then(
  "the course keeps {int} revision weeks",
  async ({ request, page }, n: number) => {
    const courses = (await (await request.get("/api/courses")).json()) as {
      id: string;
      revisionWeeks: number;
    }[];
    expect(courses.find((c) => c.id === COURSE)?.revisionWeeks).toBe(n);
    await page.reload();
    await expect(
      page.getByLabel("Weeks of revision before the exam"),
    ).toHaveValue(String(n));
  },
);

Then(
  "the preview says {string} and removes no assessment",
  async ({ page }, sentence: string) => {
    const dialog = importDialog(page);
    await expect(dialog).toContainText(sentence);
    await expect(
      dialog.getByRole("list", { name: "What would change" }),
    ).not.toContainText("mark");
  },
);

Then(
  "the assessments {string} and {string} are still in the scheme",
  async ({ page, request }, a: string, b: string) => {
    const stored = (await storedScheme(request)).items;
    for (const title of [a, b])
      expect(stored.find((i) => i.title === title)?.kind).toBe("assessment");
    await expect(page.getByRole("row", { name: a, exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: b, exact: true })).toBeVisible();
  },
);
