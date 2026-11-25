import type { Role } from "@planner/domain";
import { expect, test } from "vitest";
import { buildTestApp } from "../test-support.ts";

const PUT_TERMS = [
  { id: "T1", firstPupilDay: "2026-09-01", lastPupilDay: "2026-12-18" },
  { id: "T2", firstPupilDay: "2027-01-07", lastPupilDay: "2027-03-26" },
  { id: "T3", firstPupilDay: "2027-04-12", lastPupilDay: "2027-06-23" },
];
const put = (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  p: string,
  body: unknown,
) =>
  app.request(p, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("a route guarded for edit answers 403 for a role without it", async () => {
  const app = await buildTestApp({}, undefined, undefined, { role: "student" });
  const res = await put(app, "/api/terms", PUT_TERMS);
  expect(res.status).toBe(403);
  const body = (await res.json()) as {
    error: { code: string; message: string };
  };
  expect(body.error.code).toBe("forbidden");
  expect(body.error.message).toMatch(/not allowed/i);
});

test("the teacher is allowed, and reading stays open to every role", async () => {
  const teacher = await buildTestApp();
  expect((await put(teacher, "/api/terms", PUT_TERMS)).status).toBe(200);
  const parent = await buildTestApp({}, undefined, undefined, {
    role: "parent",
  });
  expect((await parent.request("/api/terms")).status).toBe(200);
});

test("every guarded write refuses a head of department who may only view", async () => {
  const hod: { role: Role } = { role: "head-of-department" };
  const app = await buildTestApp({}, undefined, undefined, hod);
  const calls: [string, string][] = [
    ["POST", "/api/calendar/import"],
    ["PUT", "/api/reports/windows/x/date"],
    ["PUT", "/api/reports/evenings/x/date"],
    ["PUT", "/api/terms"],
    ["POST", "/api/timetable/versions"],
    ["PUT", "/api/timetable/x"],
    ["POST", "/api/disruptions"],
    ["POST", "/api/disruptions/preview"],
    ["DELETE", "/api/disruptions/batch/x"],
    ["PUT", "/api/calendar/corrections/labels/2027-05-04"],
    ["DELETE", "/api/calendar/corrections/labels/2027-05-04"],
    ["PUT", "/api/calendar/corrections/resolutions/2027-03-19"],
    ["DELETE", "/api/calendar/corrections/resolutions/2027-03-19"],
    ["PUT", "/api/events/classifications/x"],
    ["DELETE", "/api/events/classifications/x"],
    ["POST", "/api/exams"],
    ["PUT", "/api/exams/x"],
    ["DELETE", "/api/exams/x"],
    ["POST", "/api/todos"],
    ["PATCH", "/api/todos/x"],
    ["DELETE", "/api/todos/x"],
  ];
  const statuses: Record<string, number> = {};
  for (const [method, p] of calls) {
    const res = await app.request(p, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST" && p.endsWith("import") ? {} : { body: "{}" }),
    });
    statuses[`${method} ${p}`] = res.status;
  }
  // report-calendar is view-only for her, lesson-plans too: every one is 403.
  expect(Object.values(statuses).every((s) => s === 403)).toBe(true);
});

test("no route that changes data is missing its guard", async () => {
  const app = await buildTestApp({ testRoutes: true });
  const doc = (await (await app.request("/openapi.json")).json()) as {
    paths: Record<string, Record<string, { "x-access"?: unknown }>>;
  };
  const MUTATING = ["post", "put", "patch", "delete"];
  const UNGUARDED_ON_PURPOSE = new Set([
    "POST /api/test/reset",
    "POST /api/test/ai",
  ]);
  const unguarded: string[] = [];
  let seen = 0;
  for (const [p, ops] of Object.entries(doc.paths))
    for (const [method, op] of Object.entries(ops)) {
      if (!MUTATING.includes(method)) continue;
      seen++;
      const key = `${method.toUpperCase()} ${p}`;
      if (!op["x-access"] && !UNGUARDED_ON_PURPOSE.has(key))
        unguarded.push(key);
    }
  expect(seen).toBeGreaterThanOrEqual(7);
  expect(unguarded).toEqual([]);
});
