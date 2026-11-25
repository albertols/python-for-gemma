import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import type { AiItem } from "../ports.ts";
import { createRepos } from "./index.ts";

const run = (id: string, startedAt = "2026-11-24T10:00:00.000Z") => ({
  id,
  skillId: "planner-suggest-lesson-counts" as const,
  status: "queued" as const,
  startedAt,
  durationMs: null,
  provider: null,
  model: null,
  failure: null,
  note: null,
});
const item = (
  id: string,
  runId: string,
  over: Partial<AiItem> = {},
): AiItem => ({
  id,
  runId,
  kind: "lesson-count",
  target: "ch3",
  courseId: "syn-econ",
  data: { from: 4, to: 5, nested: { reason: "Because" } },
  review: "suggested",
  reviewedAt: null,
  sources: [{ url: "https://example.org/a", title: null, opened: false }],
  ...over,
});

test("a run comes back as stored, with its items in order, and updates change only what is given", () => {
  const { ai } = createRepos(migratedDb());
  expect(ai.getRun("r1")).toBeNull();
  ai.insertRun(run("r1"));
  ai.insertItem(item("i2", "r1"));
  ai.insertItem(item("i1", "r1"));
  expect(ai.getRun("r1")).toEqual({ ...run("r1"), itemIds: ["i2", "i1"] });
  ai.updateRun("r1", { status: "done", durationMs: 1200, provider: "fake" });
  expect(ai.getRun("r1")).toMatchObject({
    status: "done",
    durationMs: 1200,
    provider: "fake",
    model: null,
    startedAt: "2026-11-24T10:00:00.000Z",
  });
});

test("runs are listed newest first, a tie going to the one added last", () => {
  const { ai } = createRepos(migratedDb());
  ai.insertRun(run("old", "2026-11-23T10:00:00.000Z"));
  ai.insertRun(run("tie1"));
  ai.insertRun(run("tie2"));
  expect(ai.listRuns().map((r) => r.id)).toEqual(["tie2", "tie1", "old"]);
});

test("an item keeps its data, sources and course exactly, and can be listed by review state", () => {
  const { ai } = createRepos(migratedDb());
  ai.insertRun(run("r1"));
  ai.insertItem(item("i1", "r1"));
  ai.insertItem(item("i2", "r1", { courseId: null, review: "rejected" }));
  expect(ai.getItem("i1")).toEqual(item("i1", "r1"));
  expect(ai.getItem("i2")?.courseId).toBeNull();
  expect(ai.listItems().map((i) => i.id)).toEqual(["i1", "i2"]);
  expect(ai.listItems({ review: "suggested" }).map((i) => i.id)).toEqual([
    "i1",
  ]);
  expect(ai.listItems({ review: "accepted" })).toEqual([]);
});

test("a review can be claimed once, replacing data when given, and restored", () => {
  const { ai } = createRepos(migratedDb());
  ai.insertRun(run("r1"));
  const original = item("i1", "r1");
  ai.insertItem(original);
  const before = ai.claimReview("i1", "edited", "2026-11-24T11:00:00.000Z", {
    to: 6,
  });
  expect(before).toEqual(original);
  expect(ai.getItem("i1")).toMatchObject({
    review: "edited",
    reviewedAt: "2026-11-24T11:00:00.000Z",
    data: { to: 6 },
  });
  expect(
    ai.claimReview("i1", "accepted", "2026-11-24T12:00:00.000Z"),
  ).toBeNull();
  expect(
    ai.claimReview("nope", "accepted", "2026-11-24T12:00:00.000Z"),
  ).toBeNull();
  ai.restoreItem(original);
  expect(ai.getItem("i1")).toEqual(original);
});

test("unfinished runs are failed with the sentence; finished ones are left alone", () => {
  const { ai } = createRepos(migratedDb());
  ai.insertRun(run("q"));
  ai.insertRun({ ...run("r"), status: "running" });
  ai.insertRun({ ...run("d"), status: "done" });
  expect(ai.failUnfinished("Closed.")).toBe(2);
  expect(ai.getRun("q")).toMatchObject({
    status: "failed",
    failure: "Closed.",
  });
  expect(ai.getRun("r")).toMatchObject({
    status: "failed",
    failure: "Closed.",
  });
  expect(ai.getRun("d")).toMatchObject({ status: "done", failure: null });
});
