import { expect, test } from "vitest";
import { migratedDb } from "../../test-support.ts";
import type { StoredDisruption } from "../ports.ts";
import { createRepos } from "./index.ts";

const row = (id: string, from: string, over = {}): StoredDisruption => ({
  id,
  batchId: "b1",
  scope: { kind: "group", groupId: "11D" },
  from,
  to: from,
  periods: [3],
  effect: "cancelled",
  reason: "School photos",
  source: "teacher",
  createdAt: "2026-11-24T10:00:00.000Z",
  ...over,
});

test("rows come back as stored, sorted by from, then id", () => {
  const { disruptions } = createRepos(migratedDb());
  expect(disruptions.list()).toEqual([]);
  const rows = [
    row("t:b", "2026-11-25", { scope: { kind: "school" }, periods: null }),
    row("t:c", "2026-11-24", { scope: { kind: "year", yearGroup: 11 } }),
    row("t:a", "2026-11-24"),
  ];
  disruptions.add(rows);
  expect(disruptions.list().map((r) => r.id)).toEqual(["t:a", "t:c", "t:b"]);
  expect(disruptions.list()).toEqual(
    expect.arrayContaining(rows) as StoredDisruption[],
  );
});

test("removing a batch takes only that batch and says how many rows went", () => {
  const { disruptions } = createRepos(migratedDb());
  disruptions.add([row("t:a", "2026-11-24"), row("t:b", "2026-11-24")]);
  disruptions.add([row("t:c", "2026-11-25", { batchId: "b2" })]);
  const before = disruptions.list();
  expect(disruptions.removeBatch("b1")).toBe(2);
  expect(disruptions.list().map((r) => r.id)).toEqual(["t:c"]);
  expect(disruptions.removeBatch("b1")).toBe(0);
  // Adding the batch back restores the list exactly.
  disruptions.add(before.filter((r) => r.batchId === "b1"));
  expect(disruptions.list()).toEqual(before);
});
