import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { createApp } from "./app.ts";
import { E2E_MARKER, loadConfig } from "./config.ts";
import { fakeGateway, migratedDb, testConfig } from "./test-support.ts";

const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-web-"));
fs.writeFileSync(path.join(webDir, "index.html"), "<title>shell</title>");
fs.mkdirSync(path.join(webDir, "assets"));
fs.writeFileSync(path.join(webDir, "assets", "app.js"), "console.log(1)");
const seededDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-seeded-"));
fs.writeFileSync(path.join(seededDir, E2E_MARKER), "");
afterAll(() => {
  fs.rmSync(webDir, { recursive: true, force: true });
  fs.rmSync(seededDir, { recursive: true, force: true });
});
const HEADER = { "x-planner-test": "1" };

const build = (over: Parameters<typeof loadConfig>[0] = {}, web?: string) =>
  createApp({
    config: {
      ...testConfig,
      ...loadConfig({ PLANNER_DATA_DIR: "/unused", ...over }),
    },
    db: migratedDb(),
    now: () => new Date("2026-11-24T10:00:00Z"),
    gateway: fakeGateway({}),
    ...(web ? { webDir: web } : {}),
  });

test("the built web app is served, with index.html for any other page", async () => {
  const app = build({}, webDir);
  const js = await app.request("/assets/app.js");
  expect(js.status).toBe(200);
  expect(await js.text()).toBe("console.log(1)");
  for (const page of ["/", "/board", "/audit"]) {
    const res = await app.request(page);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>shell</title>");
  }
});

test("an unknown /api path stays a JSON 404, never the web page", async () => {
  const res = await build({}, webDir).request("/api/nothing-here");
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    "not-found",
  );
});

test("without a web folder, a page address is a JSON 404", async () => {
  expect((await build().request("/board")).status).toBe(404);
});

test("POST /api/test/reset is a 404 unless PLANNER_TEST_ROUTES=1", async () => {
  const res = await build().request("/api/test/reset", { method: "POST" });
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    "not-found",
  );
});

test("the reset answers 403 without the x-planner-test header", async () => {
  const app = build({
    PLANNER_TEST_ROUTES: "1",
    PLANNER_DATA_DIR: seededDir,
  });
  const res = await app.request("/api/test/reset", { method: "POST" });
  expect(res.status).toBe(403);
});

test("with PLANNER_TEST_ROUTES=1 reset empties the database and seeds it again", async () => {
  const app = build({ PLANNER_TEST_ROUTES: "1", PLANNER_DATA_DIR: seededDir });
  const days = async () =>
    (await (await app.request("/api/calendar/days")).json()) as unknown[];
  expect(await days()).toHaveLength(0);
  const first = await app.request("/api/test/reset", {
    method: "POST",
    headers: HEADER,
  });
  expect(first.status).toBe(200);
  const seeded = (await days()).length;
  expect(seeded).toBeGreaterThan(100);
  // A second reset gives the same seeded state, not a doubled one.
  expect(
    (await app.request("/api/test/reset", { method: "POST", headers: HEADER }))
      .status,
  ).toBe(200);
  expect(await days()).toHaveLength(seeded);
  const groups = (await (await app.request("/api/timetable")).json()) as {
    groups: unknown[];
  };
  expect(groups.groups).toHaveLength(6);
});
