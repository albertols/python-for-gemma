import { syntheticPack } from "@planner/fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { PackReviewNotes } from "../../api/queries.ts";
import { PackTree } from "./PackTree.tsx";

const show = (over: { review?: PackReviewNotes | null; readOnly?: boolean }) =>
  renderToStaticMarkup(
    createElement(PackTree, {
      pack: syntheticPack(),
      review: over.review ?? null,
      readOnly: over.readOnly ?? false,
      busy: false,
      checked: new Set<string>(),
      onCheck: () => {},
      onChange: () => {},
    }),
  );

const notes = (reason: string): PackReviewNotes => ({
  linkReasons: [{ chapterNumber: "1", specPointId: "sp1", reason }],
  unsure: [],
  meta: null,
});

test("a reason the model wrote is shown as text, never as HTML", () => {
  const out = show({
    review: notes('<img src=x onerror="alert(1)"><b>bold</b>'),
  });
  expect(out).not.toContain("<img");
  expect(out).not.toContain("<b>bold");
  expect(out).toContain("&lt;img src=x onerror=");
  expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
});

test("a reason carries the AI badge, and only on the link it is about", () => {
  const out = show({ review: notes("Names the topic.") });
  expect(out.match(/aria-label="AI suggestion, not reviewed"/g)).toHaveLength(
    1,
  );
  expect(out).toContain("Why: Names the topic.");
});

test("a locked pack has no controls and no AI badge, but still shows every point and page", () => {
  const out = show({ readOnly: true, review: null });
  // the only buttons left are the ones that show and hide a unit's points
  expect(out.match(/<button/g)).toHaveLength(2);
  expect(out).not.toContain("Edit title");
  expect(out).not.toContain("Remove link");
  expect(out).not.toContain("Link chapter");
  expect(out).not.toContain("<input");
  expect(out).not.toContain("<select");
  expect(out).not.toContain("AI suggestion");
  expect(
    out.match(/role="treeitem" aria-selected="false" aria-level="2"/g),
  ).toHaveLength(8);
  expect(out).toContain("Page 11");
});

test("a point linked to nothing says so in words", () => {
  const pack = syntheticPack();
  pack.chapters = pack.chapters.map((c) =>
    c.id === "ch5" ? { ...c, specPointIds: [] } : c,
  );
  const out = renderToStaticMarkup(
    createElement(PackTree, {
      pack,
      review: null,
      readOnly: false,
      busy: false,
      checked: new Set<string>(),
      onCheck: () => {},
      onChange: () => {},
    }),
  );
  expect(out).toContain("No chapter is linked to this point.");
});
