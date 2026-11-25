import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSyntheticPlanningSheet,
  buildSyntheticSchedule,
  type SheetCell,
  SYNTHETIC_PLANNING_ROWS,
  syntheticScheme,
} from "@planner/fixtures";
import { afterAll, expect, test } from "vitest";
import { createResourceGateway } from "../gateway/resource-gateway.ts";
import { buildTestApp, syntheticGateway } from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;

const COURSE = "ial-business-u4";
const SHEET = "ial/Planning/Synthetic Planning.xlsx";
const DOC = "ial/Planning/Synthetic Schedule.docx";
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const send = async (app: App, method: string, url: string, body?: unknown) => {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
};

/** A planner whose gateway holds the synthetic planning files, reset to `state`. */
async function planner(
  state: string,
  rows: SheetCell[][] = SYNTHETIC_PLANNING_ROWS,
  extra: Record<string, Uint8Array> = {},
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-import-"));
  dirs.push(dataDir);
  const gateway = await syntheticGateway({
    [SHEET]: await buildSyntheticPlanningSheet(rows),
    [DOC]: await buildSyntheticSchedule(),
    ...extra,
  });
  const app = await buildTestApp(
    { fixedToday: "2026-11-20", dataDir, testRoutes: true },
    gateway,
  );
  const reset = await app.request("/api/test/reset", {
    method: "POST",
    headers: { "x-planner-test": "1", "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  expect(reset.status).toBe(200);
  return app;
}
const importUrl = `/api/scheme/${COURSE}/import`;
const both = { planningFile: SHEET, scheduleFile: DOC };

test("import-sources lists the course's planning files, sheets and schedules apart, and no other file", async () => {
  const app = await planner("m2-no-positions", undefined, {
    "ibdp/Planning/IB.xlsx": new Uint8Array([1]),
    "ial/Planning/Mock Exams/m.xlsx": new Uint8Array([1]),
    "ial/Planning/notes.pdf": new Uint8Array([1]),
  });
  const res = await send(app, "GET", `/api/scheme/${COURSE}/import-sources`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ planning: [SHEET], schedules: [DOC] });
});

test("the import is a preview: it returns items, findings and changes, and stores nothing", async () => {
  const app = await planner("m2-no-positions", [
    ...SYNTHETIC_PLANNING_ROWS.slice(0, 6),
    ["5 Costs", 1],
    ...SYNTHETIC_PLANNING_ROWS.slice(6),
  ]);
  const before = (await send(app, "GET", `/api/scheme/${COURSE}`)).body;
  const res = await send(app, "POST", importUrl, both);
  expect(res.status).toBe(200);
  expect(res.body.items.map((i: Json) => i.id)).toEqual([
    "ch1",
    "ch2",
    "a-ch2",
    "ch3",
    "a-ch3",
    "ch4",
    "ch5",
  ]);
  expect(res.body.changes).toEqual([
    { id: "ch5", title: "Costs", change: "added" },
  ]);
  // the new chapter sits in Part B, which says 6 classes, and the stated total says 10
  expect(res.body.findings.map((f: Json) => f.kind)).toEqual([
    "section-total-mismatch",
    "total-mismatch",
  ]);
  const after = (await send(app, "GET", `/api/scheme/${COURSE}`)).body;
  expect(after).toEqual(before);
  expect(after.items).toEqual(
    JSON.parse(JSON.stringify(syntheticScheme(COURSE))),
  );
});

test("importing what is already stored changes nothing, and a moved count is a change", async () => {
  const same = await planner("m2-no-positions");
  expect((await send(same, "POST", importUrl, both)).body.changes).toEqual([]);
  const moved = await planner(
    "m2-no-positions",
    SYNTHETIC_PLANNING_ROWS.map((r) =>
      r[0] === "2 Supply" ? ["2 Supply", 5] : r,
    ),
  );
  expect((await send(moved, "POST", importUrl, both)).body.changes).toEqual([
    { id: "ch2", title: "Supply", change: "changed" },
  ]);
});

test("a chapter missing from the stored scheme is added, and one the sheet lost is removed", async () => {
  const app = await planner(
    "m2-no-positions",
    SYNTHETIC_PLANNING_ROWS.filter((r) => r[0] !== "4 Prices"),
  );
  const res = await send(app, "POST", importUrl, {
    planningFile: SHEET,
    scheduleFile: null,
  });
  expect(res.body.changes).toEqual([
    { id: "ch4", title: "Prices", change: "removed" },
  ]);
  // her assessments are carried through, not removed, when no schedule is chosen
  expect(res.body.keptAssessments).toBe(2);
  expect(
    res.body.items
      .filter((i: Json) => i.kind === "assessment")
      .map((i: Json) => i.id),
  ).toEqual(["a-ch2", "a-ch3"]);
});

test("a file that is not among the planning files is refused", async () => {
  const app = await planner("m2-no-positions");
  const res = await send(app, "POST", importUrl, {
    planningFile: "ial/Specs/other.xlsx",
    scheduleFile: null,
  });
  expect(res.status).toBe(422);
  expect(res.body.error.message).toContain("planning files");
});

test("a sheet that cannot be read is refused with a sentence, and nothing is stored", async () => {
  const app = await planner("m2-no-positions", undefined, {
    "ial/Planning/Bad.xlsx": new Uint8Array([1, 2, 3]),
  });
  const res = await send(app, "POST", importUrl, {
    planningFile: "ial/Planning/Bad.xlsx",
    scheduleFile: null,
  });
  expect(res.status).toBe(422);
  expect(res.body.error.issues[0]).toContain("Excel");
});

test("an unknown course is a 404, and a course without a locked pack is a 409", async () => {
  const app = await planner("m2-draft-pack");
  expect(
    (await send(app, "POST", `/api/scheme/nope/import`, both)).status,
  ).toBe(404);
  expect((await send(app, "POST", importUrl, both)).status).toBe(409);
});

test("a role that may not edit the scheme of work cannot run the import", async () => {
  const app = await buildTestApp({}, undefined, undefined, {
    role: "student",
  });
  expect((await send(app, "POST", importUrl, both)).status).toBe(403);
});

test("import-sources is empty, not an error, when the resources folder is missing", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-import-"));
  dirs.push(dataDir);
  const missing = createResourceGateway(path.join(dataDir, "no-such-folder"));
  const app = await buildTestApp({ dataDir, testRoutes: true }, missing);
  await app.request("/api/test/reset", {
    method: "POST",
    headers: { "x-planner-test": "1", "content-type": "application/json" },
    body: JSON.stringify({ state: "m2-no-positions" }),
  });
  const res = await send(app, "GET", `/api/scheme/${COURSE}/import-sources`);
  expect(res).toEqual({ status: 200, body: { planning: [], schedules: [] } });
});
