import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeAiProvider } from "@planner/ai/fake";
import { FAKE_AI_OUTPUTS } from "@planner/fixtures";
import { afterAll, expect, test } from "vitest";
import { buildTestApp } from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;

const COURSE = "ial-business-u4";
const URL = `/api/scheme/${COURSE}/suggest-counts`;
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function planner(
  state: string,
  over: { ai?: "fake" | "off"; role?: "teacher" | "student" } = {},
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-suggest-"));
  dirs.push(dataDir);
  const app = await buildTestApp(
    {
      fixedToday: "2026-11-20",
      dataDir,
      testRoutes: true,
      ai: over.ai ?? "fake",
    },
    undefined,
    undefined,
    { role: over.role ?? "teacher" },
    new FakeAiProvider(FAKE_AI_OUTPUTS),
  );
  const reset = await app.request("/api/test/reset", {
    method: "POST",
    headers: { "x-planner-test": "1", "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  expect(reset.status).toBe(200);
  return app;
}
const post = async (app: App, url: string) => {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  return { status: res.status, body: (await res.json()) as Json };
};
const get = async (app: App, url: string) =>
  (await (await app.request(url)).json()) as Json;
async function finished(app: App, id: string): Promise<Json> {
  for (let i = 0; i < 500; i++) {
    const run = await get(app, `/api/ai/jobs/${id}`);
    if (run.status !== "queued" && run.status !== "running") return run;
    await tick();
  }
  throw new Error("the job never finished");
}

test("asking for suggestions starts the lesson-count job and the fake's one difference becomes a reviewable item", async () => {
  const app = await planner("m2-planned");
  const started = await post(app, URL);
  expect(started.status).toBe(202);
  expect(started.body.skillId).toBe("planner-suggest-lesson-counts");
  const run = await finished(app, started.body.id);
  expect(run.status).toBe("done");
  const items = await get(app, "/api/ai/items?review=suggested");
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    kind: "lesson-count",
    target: "ch3",
    courseId: COURSE,
    review: "suggested",
    data: { itemId: "ch3", title: "Markets", from: 4, to: 5 },
  });
  // asking changes nothing in her scheme
  const scheme = await get(app, `/api/scheme/${COURSE}`);
  expect(scheme.items.find((i: Json) => i.id === "ch3").lessons).toBe(4);
});

test("a student, who may not touch the scheme, is refused", async () => {
  const app = await planner("m2-planned", { role: "student" });
  expect((await post(app, URL)).status).toBe(403);
});

test("before the pack is locked there is no scheme to ask about", async () => {
  const app = await planner("m2-draft-pack");
  const res = await post(app, URL);
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("pack-not-locked");
});

test("with the AI switched off the answer says so and no job exists", async () => {
  const app = await planner("m2-planned", { ai: "off" });
  const res = await post(app, URL);
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("ai-off");
  expect(await get(app, "/api/ai/runs")).toEqual([]);
});

test("an unknown course is a 404", async () => {
  const app = await planner("m2-planned");
  expect((await post(app, "/api/scheme/nope/suggest-counts")).status).toBe(404);
});
