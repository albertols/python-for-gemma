import { type PlanRevision, sequence } from "@planner/domain";
import { paceWorld } from "@planner/fixtures";
import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import { createRepos } from "./index.ts";

test("a revision comes back exactly as stored, the head moves, and undo points back at the parent", () => {
  const repos = createRepos(migratedDb());
  repos.courses.seed([
    { id: "ial-business-u4", title: "IAL", board: "IAL", revisionWeeks: 2 },
  ]);
  const snapshot = sequence(paceWorld());
  const r1: PlanRevision = {
    id: "r1",
    planId: "ial-business-u4",
    parentId: null,
    label: "First plan",
    createdAt: "2026-10-26T09:00:00.000Z",
    snapshot,
  };
  const r2 = { ...r1, id: "r2", parentId: "r1", label: "Re-plan" };
  expect(repos.plans.head("ial-business-u4")).toBeNull();
  expect(repos.plans.heads()).toEqual([]);
  repos.plans.insertHead(r1, "ial-business-u4");
  repos.plans.insertHead(r2, "ial-business-u4");
  expect(repos.plans.head("ial-business-u4")).toEqual(r2);
  expect(repos.plans.get("r1")).toEqual(r1);
  expect(repos.plans.heads().map((r) => r.id)).toEqual(["r2"]);
  repos.plans.setHead("ial-business-u4", "r1");
  expect(repos.plans.head("ial-business-u4")).toEqual(r1);
  expect(repos.plans.get("nope")).toBeNull();
});
