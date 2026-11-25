import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AI_REVIEW_TEXT, AiBadge, aiOutline } from "./AiBadge.tsx";

const html = (review: Parameters<typeof AiBadge>[0]["review"]) =>
  renderToStaticMarkup(createElement(AiBadge, { review }));

test("a suggestion awaiting review says so in words and has a dashed outline", () => {
  const out = html("suggested");
  expect(out).toContain('role="img"');
  expect(out).toContain('aria-label="AI suggestion, not reviewed"');
  expect(out).toContain("border-dashed");
  expect(out).toContain('data-mark="sparkle"');
  expect(out).not.toContain('data-mark="pencil"');
});

test("accepted is a plain small sparkle with no dashed outline", () => {
  const out = html("accepted");
  expect(out).toContain('aria-label="AI suggestion, accepted"');
  expect(out).not.toContain("border-dashed");
  expect(out).toContain('data-mark="sparkle"');
  expect(out).not.toContain('data-mark="pencil"');
});

test("edited is a sparkle and a pencil", () => {
  const out = html("edited");
  expect(out).toContain('aria-label="AI suggestion, edited by you"');
  expect(out).toContain('data-mark="sparkle"');
  expect(out).toContain('data-mark="pencil"');
});

test("every state has its own words, so colour is never the only difference", () => {
  const words = Object.values(AI_REVIEW_TEXT);
  expect(new Set(words).size).toBe(words.length);
  expect(AI_REVIEW_TEXT.rejected).toBe("AI suggestion, rejected");
});

test("only an item awaiting review gets the dashed outline", () => {
  expect(aiOutline("suggested")).toContain("border-dashed");
  for (const r of ["accepted", "edited", "rejected"] as const)
    expect(aiOutline(r)).not.toContain("border-dashed");
});
