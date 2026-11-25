import { TEACHER_PRINCIPAL } from "@planner/domain";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { fakeGateway, migratedDb, testConfig } from "./test-support.ts";

const build = (over: Partial<Config> = {}, now = "2026-11-24T10:00:00Z") =>
  createApp({
    ai: null,
    config: { ...testConfig, ...over },
    db: migratedDb(),
    now: () => new Date(now),
    gateway: fakeGateway({}),
    principal: TEACHER_PRINCIPAL,
  });

test("health", async () =>
  expect(await (await build().request("/api/health")).json()).toEqual({
    ok: true,
  }));

test("config reports the fixed today when set, otherwise the local date", async () => {
  const fixed = build({ fixedToday: "2026-11-20" });
  expect(await (await fixed.request("/api/config")).json()).toEqual({
    today: "2026-11-20",
    timeZone: "Europe/Madrid",
    ai: {
      mode: "claude",
      available: false,
      reason: "The AI is not set up on this server.",
    },
  });
  const local = build({}, "2026-11-23T23:13:00Z");
  expect(
    ((await (await local.request("/api/config")).json()) as { today: string })
      .today,
  ).toBe("2026-11-24");
});

test("AI mode off is reported as off, not as unbuilt", async () => {
  const body = (await (
    await build({ ai: "off" }).request("/api/config")
  ).json()) as {
    ai: unknown;
  };
  expect(body.ai).toEqual({ mode: "off", available: false, reason: null });
});

test("an unexpected error is JSON without a stack", async () => {
  const app = build();
  app.get("/api/boom", () => {
    throw new Error("secret detail");
  });
  const res = await app.request("/api/boom");
  expect(res.status).toBe(500);
  const text = await res.text();
  expect(JSON.parse(text).error.code).toBe("internal");
  expect(text).not.toContain("at ");
  expect(text).not.toContain("secret detail");
});

test("an unknown route is a JSON 404", async () => {
  const res = await build().request("/api/nope");
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    "not-found",
  );
});

test("openapi.json is served", async () => {
  const res = await build().request("/openapi.json");
  expect(res.status).toBe(200);
  expect(Object.keys(((await res.json()) as { paths: object }).paths)).toEqual(
    expect.arrayContaining(["/api/health", "/api/config"]),
  );
});

test("malformed JSON keeps its 400 and has no stack", async () => {
  const res = await build().request("/api/terms", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  expect(res.status).toBe(400);
  const text = await res.text();
  expect(JSON.parse(text).error.code).toBe("bad-request");
  expect(text).not.toContain("    at ");
});

test("a body that fails validation is a 422 with a readable message", async () => {
  const res = await build().request("/api/terms", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{ id: "T9" }]),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as {
    error: { code: string; message: string };
  };
  expect(body.error.code).toBe("invalid-request");
  expect(body.error.message.length).toBeGreaterThan(5);
});
