import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ReviewBar } from "./ReviewBar.tsx";

const noop = () => {};
const bar = (review: "suggested" | "accepted", withEdit = true) =>
  renderToStaticMarkup(
    createElement(ReviewBar, {
      item: { id: "i1", review },
      onAccept: noop,
      onReject: noop,
      ...(withEdit ? { onEdit: noop } : {}),
    }),
  );

test("a suggestion can be accepted, edited or rejected", () => {
  const out = bar("suggested");
  for (const name of ["Accept", "Edit", "Reject"])
    expect(out).toContain(`>${name}</button>`);
});

test("without an edit handler there is no Edit button", () => {
  expect(bar("suggested", false)).not.toContain(">Edit</button>");
});

test("a reviewed item has nothing left to decide", () => {
  expect(bar("accepted")).toBe("");
});
