import fs from "node:fs";
import {
  buildSyntheticPlanningSheet,
  buildSyntheticSchedule,
  SYNTHETIC_PLANNING_ROWS,
  syntheticScheme,
} from "@planner/fixtures";
import { afterAll, expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import { seededRepos, syntheticGateway } from "../test-support.ts";
import { importScheme, importSources } from "./import-scheme.ts";

const COURSE = "ial-business-u4";
const SHEET = "ial/Planning/Synthetic Planning.xlsx";
const DOC = "ial/Planning/Synthetic Schedule.docx";
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

async function setup(state: "m2-no-positions" | "m2-draft-pack") {
  const s = await seededRepos(state);
  dirs.push(s.dataDir);
  const gateway = await syntheticGateway({
    [SHEET]: await buildSyntheticPlanningSheet(),
    [DOC]: await buildSyntheticSchedule(),
    "ibdp/Planning/IB.xlsx": new Uint8Array([1]),
    "ial/Planning/Bad.xlsx": new Uint8Array([1, 2, 3]),
  });
  return { ...s, gateway };
}
const refusal = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("not refused");
};

test("the sources are the course's board folder only, sheets and schedules apart", async () => {
  const { repos, gateway } = await setup("m2-no-positions");
  expect(await importSources(gateway, repos, COURSE)).toEqual({
    planning: ["ial/Planning/Bad.xlsx", SHEET],
    schedules: [DOC],
  });
});

test("the preview holds the items, both totals' finding and no change against the stored scheme", async () => {
  const { repos, packs, gateway } = await setup("m2-no-positions");
  const preview = await importScheme(
    { repos, packs, gateway },
    COURSE,
    { planningFile: SHEET, scheduleFile: DOC },
    "2026-11-20",
  );
  expect(preview.items).toEqual(syntheticScheme(COURSE));
  expect(preview.changes).toEqual([]);
  expect(preview.findings.map((f) => f.kind)).toEqual(["total-mismatch"]);
  expect(repos.scheme.items(COURSE)).toEqual(syntheticScheme(COURSE));
  expect(SYNTHETIC_PLANNING_ROWS.length).toBeGreaterThan(0);
});

test("a schedule dated before today comes in as sat", async () => {
  const { repos, packs, gateway } = await setup("m2-no-positions");
  const preview = await importScheme(
    { repos, packs, gateway },
    COURSE,
    { planningFile: SHEET, scheduleFile: DOC },
    "2026-12-01",
  );
  expect(preview.changes).toEqual([
    { id: "a-ch2", title: "20 mark", change: "changed" },
  ]);
});

test("a file outside the course's planning files, an unreadable sheet and an unlocked pack are refused", async () => {
  const { repos, packs, gateway } = await setup("m2-no-positions");
  const ask = (planningFile: string) =>
    importScheme(
      { repos, packs, gateway },
      COURSE,
      { planningFile, scheduleFile: null },
      "2026-11-20",
    );
  expect((await refusal(() => ask("ibdp/Planning/IB.xlsx"))).status).toBe(422);
  const bad = await refusal(() => ask("ial/Planning/Bad.xlsx"));
  expect([bad.status, bad.code]).toEqual([422, "unreadable-planning-file"]);
  const draft = await setup("m2-draft-pack");
  const locked = await refusal(() =>
    importScheme(
      { repos: draft.repos, packs: draft.packs, gateway: draft.gateway },
      COURSE,
      { planningFile: SHEET, scheduleFile: null },
      "2026-11-20",
    ),
  );
  expect(locked.status).toBe(409);
});
