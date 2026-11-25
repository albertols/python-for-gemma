import { syntheticPack } from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  lockBlockers,
  withLink,
  withoutLink,
  withPointTitle,
  withUnitScope,
  withUnitTitle,
} from "./pack-review.ts";

/** The draft the browser tests start from: spec point sp5 (1.5) is linked to no chapter. */
const draft = () => {
  const pack = syntheticPack();
  return {
    ...pack,
    chapters: pack.chapters.map((c) =>
      c.id === "ch5" ? { ...c, specPointIds: [] } : c,
    ),
  };
};
const CHECKED = new Set(["u1"]);

test("one unlinked point blocks the lock, in words, and says which", () => {
  expect(lockBlockers(draft(), CHECKED)).toEqual([
    "1 point is not linked to a chapter: 1.5.",
  ]);
});

test("several unlinked points are counted and listed by code", () => {
  const pack = draft();
  pack.chapters = pack.chapters.map((c) =>
    c.id === "ch4" ? { ...c, specPointIds: [] } : c,
  );
  expect(lockBlockers(pack, CHECKED)).toEqual([
    "2 points are not linked to a chapter: 1.4, 1.5.",
  ]);
});

test("an in-scope unit that is not checked blocks the lock; an out-of-scope one does not", () => {
  const pack = syntheticPack();
  expect(lockBlockers(pack, new Set())).toEqual([
    "1 unit is not marked as checked.",
  ]);
  expect(lockBlockers(pack, CHECKED)).toEqual([]);
});

test("a unit marked out of scope no longer needs a check or links, and its points stop counting", () => {
  const out = withUnitScope(draft(), "u1", false);
  expect(lockBlockers(out, new Set())).toEqual([]);
});

test("broken references are blockers too, in the pack's own sentences", () => {
  const pack = syntheticPack();
  pack.chapters = pack.chapters.map((c) =>
    c.id === "ch1" ? { ...c, specPointIds: ["sp1", "sp2", "nope"] } : c,
  );
  expect(lockBlockers(pack, CHECKED)).toEqual([
    "Chapter ch1 links to spec point nope, which does not exist.",
  ]);
});

test("adding a link makes the point mapped, once, and leaves the original alone", () => {
  const before = draft();
  const after = withLink(before, "ch5", "sp5");
  expect(after.chapters.find((c) => c.id === "ch5")?.specPointIds).toEqual([
    "sp5",
  ]);
  expect(withLink(after, "ch5", "sp5")).toEqual(after);
  expect(before.chapters.find((c) => c.id === "ch5")?.specPointIds).toEqual([]);
  expect(lockBlockers(after, CHECKED)).toEqual([]);
});

test("removing a link unmaps the point", () => {
  const after = withoutLink(syntheticPack(), "ch5", "sp5");
  expect(lockBlockers(after, CHECKED)).toEqual([
    "1 point is not linked to a chapter: 1.5.",
  ]);
});

test("a corrected title is trimmed, and an empty one is refused (the old title stays)", () => {
  const pack = syntheticPack();
  expect(
    withUnitTitle(pack, "u1", "  Markets and prices ").units[0]?.title,
  ).toBe("Markets and prices");
  expect(withUnitTitle(pack, "u1", "   ")).toBe(pack);
  expect(
    withPointTitle(pack, "sp2", "Elasticity").specPoints.find(
      (p) => p.id === "sp2",
    )?.title,
  ).toBe("Elasticity");
  expect(withPointTitle(pack, "sp2", "")).toBe(pack);
});
