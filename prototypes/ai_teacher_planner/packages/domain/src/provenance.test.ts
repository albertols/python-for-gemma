import { expect, test } from "vitest";
import type { EventClassification } from "./events.ts";
import {
  ENGINE,
  exportable,
  IMPORTED,
  type Origin,
  type Provenance,
  type ReviewState,
  TEACHER,
} from "./provenance.ts";

test("the provenance union is now Origin, and an event classification still carries one", () => {
  const o: Origin = "teacher";
  // Typecheck proves that EventClassification.provenance is an Origin.
  const stored: EventClassification["provenance"] = o;
  expect(ENGINE.origin).toBe("engine");
  expect(TEACHER.origin).toBe("teacher");
  expect(IMPORTED.origin).toBe("import");
  expect(stored).toBe("teacher");
});

test("engine, teacher and imported provenance carry no AI details", () => {
  for (const p of [ENGINE, TEACHER, IMPORTED]) expect(p.ai).toBeNull();
});

const ai = (review: ReviewState): Provenance => ({
  origin: "ai",
  ai: {
    runId: "run-1",
    provider: "fake",
    model: "fake-model",
    skillId: "propose-pack",
    at: "2026-11-25T09:00:00Z",
    sources: [{ url: "https://example.test/spec", title: null, opened: true }],
    review,
  },
});

test("unreviewed and rejected AI items are not exportable; accepted and edited ones are", () => {
  const items = [
    { id: "a", provenance: ai("suggested") },
    { id: "b", provenance: ai("accepted") },
    { id: "c", provenance: ai("edited") },
    { id: "d", provenance: ai("rejected") },
    { id: "e", provenance: ENGINE },
  ];
  const { included, excluded } = exportable(items);
  expect(included.map((i) => i.id)).toEqual(["b", "c", "e"]);
  expect(excluded.map((i) => i.id)).toEqual(["a", "d"]);
});

test("teacher and imported items are exportable without a review", () => {
  const { included, excluded } = exportable([
    { id: "t", provenance: TEACHER },
    { id: "i", provenance: IMPORTED },
  ]);
  expect(included).toHaveLength(2);
  expect(excluded).toEqual([]);
});

test("an item marked ai but with no AI details is not exportable", () => {
  const broken: Provenance = { origin: "ai", ai: null };
  expect(exportable([{ id: "x", provenance: broken }]).excluded).toHaveLength(
    1,
  );
});
