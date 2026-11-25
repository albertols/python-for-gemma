import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SuggestedGrid } from "./SuggestedGrid.tsx";

const current = {
  id: "v1",
  validFrom: "2026-08-31",
  entries: [
    {
      week: "W1" as const,
      weekday: 1 as const,
      period: 1 as const,
      groupId: "13 1",
      room: "101",
    },
    {
      week: "W1" as const,
      weekday: 2 as const,
      period: 3 as const,
      groupId: "13 3",
      room: null,
    },
  ],
  duties: [],
};
const suggestion = {
  versionId: "v1",
  entries: [
    // unchanged
    {
      week: "W1" as const,
      weekday: 1 as const,
      period: 1 as const,
      groupId: "13 1",
      room: "101",
    },
    // a new room
    {
      week: "W1" as const,
      weekday: 2 as const,
      period: 3 as const,
      groupId: "13 3",
      room: "305",
    },
  ],
  duties: [],
  unsure: [],
};
const html = renderToStaticMarkup(
  createElement(SuggestedGrid, { current, suggestion }),
);
const cells = (marked: boolean) =>
  [...html.matchAll(/<td[^>]*data-changed="(true|false)"[^>]*>/g)].filter(
    (m) => (m[1] === "true") === marked,
  );

test("the suggested grid sits beside the current one, one pair per week", () => {
  expect(html).toContain("Week 1, current");
  expect(html).toContain("Week 1, suggested");
  expect(html).toContain("Week 2, current");
  expect(html).toContain("Week 2, suggested");
});

test("only the cell that differs is marked, in both grids, and it says what it was", () => {
  // one changed cell in the current grid and one in the suggested grid
  expect(cells(true)).toHaveLength(2);
  expect(html).toContain("13 3 (305)");
  expect(html).toContain("Changed: was 13 3");
  expect(html).toContain("Changed: now 13 3 (305)");
  // the cell that is the same is not marked
  expect(html).not.toContain("Changed: was 13 1");
  expect(html).toContain("1 cell differs");
});

test("with no difference it says so", () => {
  const same = renderToStaticMarkup(
    createElement(SuggestedGrid, {
      current,
      suggestion: { ...suggestion, entries: current.entries },
    }),
  );
  expect(same).toContain("The picture matches your timetable");
  expect(same).not.toContain('data-changed="true"');
});
