import { expect, test } from "vitest";
import { buildTestApp } from "./test-support.ts";

const call = async (host: string | null, path = "/api/health", port = 4319) => {
  const app = await buildTestApp({ port });
  const res = await app.request(
    path,
    host === null ? {} : { headers: { host } },
  );
  return {
    status: res.status,
    body: (await res.json()) as { error?: { code: string } },
  };
};

test("only 127.0.0.1 and localhost on the configured port are answered", async () => {
  expect((await call("127.0.0.1:4319")).status).toBe(200);
  expect((await call("localhost:4319")).status).toBe(200);
  expect((await call("LOCALHOST:4319")).status).toBe(200);
  expect((await call("127.0.0.1:4320", "/api/health", 4320)).status).toBe(200);
});

test("any other Host is refused with 421 on every route, so a rebinding page cannot read anything", async () => {
  for (const host of [
    "evil.example:4319",
    "evil.example",
    "127.0.0.1",
    "localhost",
    "127.0.0.1:4320",
    "localhost:80",
    "127.0.0.1.evil.example:4319",
    "evil.example:4319@127.0.0.1:4319",
    "0.0.0.0:4319",
    "[::1]:4319",
    "",
  ]) {
    for (const path of [
      "/api/health",
      "/api/lesson-notes?groupId=13%201&lessonId=ch1%231",
      "/api/materials/x",
      "/",
      "/openapi.json",
    ]) {
      const r = await call(host, path);
      expect([host, path, r.status]).toEqual([host, path, 421]);
      expect(r.body.error?.code).toBe("bad-host");
    }
  }
});
