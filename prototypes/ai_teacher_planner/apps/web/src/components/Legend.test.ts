import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LegendContent } from "./Legend.tsx";

test("the legend shows the three marks and the fixed sentence", () => {
  const out = renderToStaticMarkup(createElement(LegendContent));
  expect(out).toContain(
    "Everything without the sparkle is calculated from your calendar and timetable.",
  );
  expect(out).toContain("Awaiting your review");
  expect(out).toContain("Accepted");
  expect(out).toContain("Edited by you");
  expect(out).toContain('aria-label="AI suggestion, not reviewed"');
  expect(out).toContain('aria-label="AI suggestion, accepted"');
  expect(out).toContain('aria-label="AI suggestion, edited by you"');
});
