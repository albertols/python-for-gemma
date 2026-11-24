import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AuditView } from "./AuditScreen.tsx";

const counts = (open: number, cancelled: number) => ({
  open,
  cancelled,
  cover: 0,
});
const audit = {
  rows: [
    {
      block: {
        id: "b1",
        termId: "T1" as const,
        from: "2026-09-04",
        to: "2026-10-23",
      },
      perGroup: { "11D": counts(20, 1), "13 1": counts(10, 0) },
    },
    {
      block: {
        id: "b2",
        termId: "T1" as const,
        from: "2026-11-02",
        to: "2026-12-22",
      },
      perGroup: { "11D": counts(18, 0), "13 1": counts(9, 0) },
    },
  ],
  lost: [
    {
      key: "11D|2026-10-02|3",
      groupId: "11D",
      date: "2026-10-02",
      period: 3 as const,
      weekLabel: "W1" as const,
      room: "202",
      status: "cancelled" as const,
      reasons: [
        {
          disruptionId: "d1",
          text: "Year 11 trip",
          source: "teacher" as const,
        },
      ],
      doubleWith: null,
    },
  ],
  daysOff: [],
};

const html = renderToStaticMarkup(
  createElement(AuditView, { audit, colours: new Map() }),
);

test("a cancelled lesson shows as lost in its block and in the year total", () => {
  // Block 1, 11D: 20 taught, 1 lost.
  expect(html).toMatch(/>20<span[^>]*> \(1 lost\)<\/span><\/td>/);
  // Year total of 11D: 20 + 18 taught, 1 lost; 13 1 has none lost.
  expect(html).toMatch(/>38<span[^>]*> \(1 lost\)<\/span><\/td>/);
  expect(html).toMatch(/>19<\/td>/);
});

test("the cancelled-lessons list names group, period, date and reason", () => {
  expect(html).toContain("Year 11 trip");
  expect(html).toContain("Friday 2 October 2026");
  expect(html).not.toContain("No lessons have been cancelled");
});

test("block dates include the year", () => {
  expect(html).toContain("4 September 2026");
});
