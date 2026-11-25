import type { EventClassification } from "@planner/domain";
import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

const k = (id: string, over: Partial<EventClassification> = {}) =>
  ({
    id,
    wordingKey: "mock exams",
    yearGroup: 13,
    onlyDates: ["2027-01-11"],
    decision: "cancels",
    groupIds: ["13 1"],
    periods: [5, 6],
    until: "2027-01-15",
    provenance: "teacher",
    ...over,
  }) satisfies EventClassification;

test("a confirmation comes back exactly as stored, nulls included", () => {
  const { events } = createRepos(migratedDb());
  expect(events.list()).toEqual([]);
  const plain = k("b", {
    yearGroup: null,
    onlyDates: null,
    groupIds: null,
    periods: null,
    until: null,
  });
  events.upsert(k("a"), "2026-11-24T10:00:00.000Z");
  events.upsert(plain, "2026-11-24T10:00:00.000Z");
  expect(events.list()).toEqual([k("a"), plain]);
});

test("saving the same id replaces it; removing says whether anything went", () => {
  const { events } = createRepos(migratedDb());
  events.upsert(k("a"), "t");
  events.upsert(k("a", { decision: "no-effect", until: null }), "t");
  expect(events.list()).toHaveLength(1);
  expect(events.list()[0]?.decision).toBe("no-effect");
  expect(events.remove("a")).toBe(true);
  expect(events.remove("a")).toBe(false);
  expect(events.list()).toEqual([]);
});
