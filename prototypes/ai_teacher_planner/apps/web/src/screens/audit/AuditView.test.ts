import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AuditView } from "./AuditScreen.tsx";

const counts = (open: number, cancelled: number, cover = 0) => ({
  open,
  cancelled,
  cover,
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
      perGroup: { "11D": counts(20, 1), "13 1": counts(10, 0, 2) },
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
  lostByReason: [
    { reason: "Year 11 trip", perGroup: { "11D": 1 } },
    { reason: "Mock <b>exams</b>", perGroup: { "13 1": 5, "13 3": 3 } },
  ],
  lastLesson: { "11D": "2027-05-11", "13 1": "2027-05-07", "13 3": null },
};
const exams = [
  {
    id: "x1",
    code: "WBS14 01",
    title: "IAL <i>Unit</i> 4: Global Business",
    date: "2027-06-01",
    session: "morning" as const,
    durationMinutes: 120,
    groupIds: ["13 1", "13 3"],
    source: "https://example.test/ial.pdf",
  },
];

const html = renderToStaticMarkup(
  createElement(AuditView, { audit, exams, colours: new Map() }),
);

test("a cancelled lesson shows as lost in its block and in the year total", () => {
  // Block 1, 11D: 20 taught, 1 lost.
  expect(html).toMatch(/>20<span[^>]*> \(1 lost\)<\/span><\/td>/);
  // Year total of 11D: 20 + 18 taught, 1 lost; 13 1 has none lost.
  expect(html).toMatch(/>38<span[^>]*> \(1 lost\)<\/span><\/td>/);
});

test("cover lessons count as taught, in the block cell and the year total", () => {
  // 13 1, block 1: 10 open + 2 cover. Year: 12 + 9.
  expect(html).toMatch(/>12<\/td>/);
  expect(html).toMatch(/>21<\/td>/);
});

test("the cancelled-lessons list names group, period, date and reason", () => {
  expect(html).toContain("Year 11 trip");
  expect(html).toContain("Friday 2 October 2026");
  expect(html).not.toContain("No lessons have been cancelled");
});

test("block dates include the year", () => {
  expect(html).toContain("4 September 2026");
});

test("lessons that will not run are listed by reason with a count for each group, as text", () => {
  expect(html).toContain("Lessons that will not run");
  expect(html).toMatch(/data-reason="Year 11 trip"/);
  expect(html).toMatch(
    /data-group="11D"[^>]*>(?:<[^>]+>)*11D(?:<[^>]+>)*: 1 lesson</,
  );
  expect(html).toMatch(
    /data-group="13 1"[^>]*>(?:<[^>]+>)*13 1(?:<[^>]+>)*: 5 lessons</,
  );
  // The reason is escaped, never markup.
  expect(html).toContain("Mock &lt;b&gt;exams&lt;/b&gt;");
  expect(html).not.toContain("<b>exams</b>");
});

test("each group shows its last lesson and its exams", () => {
  expect(html).toContain("Last lesson and official exams");
  const row = (id: string) =>
    html.match(new RegExp(`<li[^>]*data-last-lesson="${id}".*?</li>`))?.[0] ??
    "";
  expect(row("13 1")).toContain("Friday 7 May 2027");
  expect(row("13 1")).toContain("WBS14 01");
  expect(row("13 1")).toContain("Tuesday 1 June 2027");
  expect(row("13 3")).toContain("No lesson left");
  expect(row("13 3")).toContain("WBS14 01");
  expect(row("11D")).toContain("Tuesday 11 May 2027");
  expect(row("11D")).not.toContain("WBS14 01");
});

test("an exam title with markup is shown as text", () => {
  expect(html).toContain("IAL &lt;i&gt;Unit&lt;/i&gt; 4");
  expect(html).not.toContain("<i>Unit</i>");
});
