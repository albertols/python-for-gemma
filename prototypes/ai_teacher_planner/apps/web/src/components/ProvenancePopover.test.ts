import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ProvenancePopover } from "./ProvenancePopover.tsx";

const ai = {
  runId: "r1",
  provider: "claude-code",
  model: "sonnet",
  skillId: "planner-suggest-lesson-counts",
  at: "2026-11-24T10:00:00.000Z",
  sources: [
    { url: "https://example.test/spec.pdf", title: "The spec", opened: true },
    { url: "https://example.test/other", title: null, opened: false },
    { url: "javascript:alert(1)", title: "Odd", opened: false },
  ],
  review: "suggested" as const,
};
const show = (p: Parameters<typeof ProvenancePopover>[0]["provenance"]) =>
  renderToStaticMarkup(
    createElement(ProvenancePopover, {
      provenance: p,
      timeZone: "Europe/Madrid",
      defaultOpen: true,
    }),
  );

test("it names the provider, model, skill and time", () => {
  const out = show({ origin: "ai", ai });
  expect(out).toContain("claude-code");
  expect(out).toContain("sonnet");
  expect(out).toContain("planner-suggest-lesson-counts");
  expect(out).toContain("24 November 2026, 11:00");
});

test("each source is a link, marked opened or not opened in words", () => {
  const out = show({ origin: "ai", ai });
  expect(out).toContain('href="https://example.test/spec.pdf"');
  expect(out).toContain("The spec");
  expect(out).toMatch(/The spec<\/a>[\s\S]*?opened/);
  expect(out).toContain("not opened");
  expect(out).toContain('rel="noreferrer noopener"');
});

test("a source that is not a web address is shown as text, never as a link", () => {
  const out = show({ origin: "ai", ai });
  expect(out).not.toContain('href="javascript:');
  expect(out).toContain("Odd");
});

test("a run with no sources says so", () => {
  expect(show({ origin: "ai", ai: { ...ai, sources: [] } })).toContain(
    "No sources",
  );
});

test("engine output has nothing to explain: no popover at all", () => {
  expect(show({ origin: "engine", ai: null })).toBe("");
});

test("closed, it is one button that says it is collapsed", () => {
  const out = renderToStaticMarkup(
    createElement(ProvenancePopover, {
      provenance: { origin: "ai", ai },
      timeZone: "Europe/Madrid",
    }),
  );
  expect(out).toContain('aria-expanded="false"');
  expect(out).not.toContain("claude-code");
});
