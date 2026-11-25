import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

export const TEST = { "x-planner-test": "1" };
export const COURSE = "ial-business-u4";
export const YEAR_13 = ["13 1", "13 3", "13 5"];
/** The first plan "m2-planned" accepts. */
export const SEED_HEAD = "r:seed-first-plan";

export async function resetTo(
  request: APIRequestContext,
  state: "m2-no-positions" | "m2-planned",
): Promise<void> {
  const res = await request.post("/api/test/reset", {
    headers: TEST,
    data: { state },
  });
  expect(res.ok()).toBe(true);
}

/** The accepted plan's head, whether undo can go back, and whether it is up to date. */
export async function planStatus(request: APIRequestContext): Promise<{
  head: { id: string; label: string } | null;
  canUndo: boolean;
  upToDate: boolean;
}> {
  const res = await request.get(`/api/plans/${COURSE}`);
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Lessons cancelled for one group on one day, as "Lessons were cancelled" stores them. */
export async function cancelDay(
  request: APIRequestContext,
  groupId: string,
  date: string,
): Promise<void> {
  const res = await request.post("/api/disruptions", {
    data: {
      scope: "groups",
      groupIds: [groupId],
      from: date,
      to: date,
      periods: null,
      reason: "Trip",
    },
  });
  expect(res.ok()).toBe(true);
}

export const proposalDialog = (page: Page): Locator =>
  page.getByRole("dialog", { name: /^Proposal:/ });

/**
 * Every lesson cell of the board on screen, as a reader meets it: its name,
 * its status and the lesson it describes.
 */
export async function boardCells(page: Page): Promise<string[]> {
  await expect(page.getByRole("table").first()).toBeVisible();
  return page.locator('td[data-kind="lesson"]').evaluateAll((cells) =>
    cells.map((c) => {
      const ids = (c.getAttribute("aria-describedby") ?? "").split(" ");
      const description = ids
        .map((id) => (id ? document.getElementById(id)?.textContent : ""))
        .join(" ");
      return `${c.getAttribute("aria-label")} | ${c.getAttribute("data-status")} | ${description}`;
    }),
  );
}
