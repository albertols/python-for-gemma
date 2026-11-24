import { expect, test } from "vitest";
import { buildTestApp } from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;
const send = async (app: App, method: string, url: string, body?: unknown) => {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
};
const fresh = () =>
  buildTestApp({ fixedToday: "2026-11-20" }, undefined, "2026-11-20T09:00:00Z");
const add = (app: App, text: string, scope: string, date: string) =>
  send(app, "POST", "/api/todos", { text, scope, date });
const lists = async (app: App, date = "2026-11-20") =>
  (await send(app, "GET", `/api/todos?date=${date}`)).body;

test("a new note gets an id and a created time from the API, and is listed under Today", async () => {
  const app = await fresh();
  const res = await add(
    app,
    "Print the Unit 4 case study",
    "day",
    "2026-11-20",
  );
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    text: "Print the Unit 4 case study",
    scope: "day",
    date: "2026-11-20",
    done: false,
    createdAt: "2026-11-20T09:00:00.000Z",
  });
  expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  const l = await lists(app);
  expect(l.today).toEqual([res.body]);
  expect(l.week).toEqual([]);
  expect(l.stillToDo).toEqual([]);
});

test("a week note is stored on that week's Monday and listed under This week", async () => {
  const app = await fresh();
  const res = await add(app, "Mark the mock papers", "week", "2026-11-20");
  expect(res.status).toBe(201);
  expect(res.body.date).toBe("2026-11-16");
  expect((await lists(app, "2026-11-18")).week).toEqual([res.body]);
  expect((await lists(app, "2026-11-23")).week).toEqual([]);
});

test("an undone note from an earlier day or week carries over; a done one does not", async () => {
  const app = await fresh();
  const old = await add(app, "Email the exam board", "day", "2026-11-19");
  const oldWeek = await add(app, "Order books", "week", "2026-11-09");
  const doneOld = await add(app, "Already done", "day", "2026-11-18");
  await send(app, "PATCH", `/api/todos/${doneOld.body.id}`, { done: true });
  const l = await lists(app);
  expect(l.stillToDo.map((n: Json) => n.id).sort()).toEqual(
    [old.body.id, oldWeek.body.id].sort(),
  );
  expect(l.today).toEqual([]);
  // Ticking the carried-over note takes it out of Still to do.
  await send(app, "PATCH", `/api/todos/${old.body.id}`, { done: true });
  expect((await lists(app)).stillToDo.map((n: Json) => n.id)).toEqual([
    oldWeek.body.id,
  ]);
});

test("a done note stays listed under Today and can be unticked", async () => {
  const app = await fresh();
  const n = await add(app, "Print it", "day", "2026-11-20");
  const ticked = await send(app, "PATCH", `/api/todos/${n.body.id}`, {
    done: true,
  });
  expect(ticked.status).toBe(200);
  expect(ticked.body.done).toBe(true);
  expect((await lists(app)).today[0].done).toBe(true);
  await send(app, "PATCH", `/api/todos/${n.body.id}`, { done: false });
  expect((await lists(app)).today[0].done).toBe(false);
});

test("the text can be changed, trimmed, and is checked again", async () => {
  const app = await fresh();
  const n = await add(app, "Print it", "day", "2026-11-20");
  const res = await send(app, "PATCH", `/api/todos/${n.body.id}`, {
    text: "  Print two copies  ",
  });
  expect(res.body.text).toBe("Print two copies");
  expect(
    (await send(app, "PATCH", `/api/todos/${n.body.id}`, { text: " " })).status,
  ).toBe(422);
  expect((await send(app, "PATCH", `/api/todos/${n.body.id}`, {})).status).toBe(
    422,
  );
});

test("removing a note takes it away; an unknown id is a 404", async () => {
  const app = await fresh();
  const n = await add(app, "Print it", "day", "2026-11-20");
  expect((await send(app, "DELETE", `/api/todos/${n.body.id}`)).status).toBe(
    200,
  );
  expect((await lists(app)).today).toEqual([]);
  expect((await send(app, "DELETE", `/api/todos/${n.body.id}`)).status).toBe(
    404,
  );
  expect(
    (await send(app, "PATCH", "/api/todos/nope", { done: true })).status,
  ).toBe(404);
});

test("empty text, or text over 200 characters after trimming, is refused and stores nothing", async () => {
  const app = await fresh();
  for (const text of ["", "   ", "x".repeat(201), `  ${"x".repeat(201)}  `]) {
    const res = await add(app, text, "day", "2026-11-20");
    expect(res.status).toBe(422);
  }
  expect(
    (await add(app, "x".repeat(201), "day", "2026-11-20")).body.error.message,
  ).toBe("A note can be at most 200 characters.");
  expect(
    (await add(app, `  ${"x".repeat(200)}  `, "day", "2026-11-20")).status,
  ).toBe(201);
  expect((await lists(app)).today).toHaveLength(1);
});

test("markup is stored and returned as typed, never changed", async () => {
  const app = await fresh();
  const text = "<script>alert(1)</script>";
  const res = await add(app, text, "day", "2026-11-20");
  expect(res.status).toBe(201);
  expect((await lists(app)).today[0].text).toBe(text);
});

test("a bad scope, a bad date on a note or a date that is not an ISO date is a 422", async () => {
  const app = await fresh();
  expect((await add(app, "x", "month", "2026-11-20")).status).toBe(422);
  expect((await add(app, "x", "day", "20 Nov")).status).toBe(422);
  expect((await add(app, "x", "day", "2026-02-30")).status).toBe(422);
  for (const date of ["", "tomorrow", "2026-13-01"])
    expect((await send(app, "GET", `/api/todos?date=${date}`)).status).toBe(
      422,
    );
  expect((await send(app, "GET", "/api/todos")).status).toBe(422);
});

test("each list is sorted by created time, then id", async () => {
  const app = await buildTestApp({}, undefined, "2026-11-20T09:00:00Z");
  const a = await add(app, "first", "day", "2026-11-20");
  const b = await add(app, "second", "day", "2026-11-20");
  const ids = [a.body.id, b.body.id];
  expect((await lists(app)).today.map((n: Json) => n.id)).toEqual(
    [...ids].sort(),
  );
});
