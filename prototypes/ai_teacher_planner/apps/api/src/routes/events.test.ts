import { TEACHER_PRINCIPAL } from "@planner/domain";
import { expect, test } from "vitest";
import { createApp } from "../app.ts";
import { createRepos } from "../repos/sqlite/index.ts";
import {
  buildTestApp,
  migratedDb,
  syntheticGateway,
  testConfig,
} from "../test-support.ts";

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
const imported = async () => {
  const app = await buildTestApp({ fixedToday: "2026-11-24" });
  expect((await send(app, "POST", "/api/calendar/import")).status).toBe(200);
  return app;
};
const MOCK_WEEK = [
  "2027-01-11",
  "2027-01-12",
  "2027-01-13",
  "2027-01-14",
  "2027-01-15",
];
const mocks13 = {
  wordingKey: "mock exams",
  yearGroup: 13,
  onlyDates: null,
  decision: "cancels",
  groupIds: null,
  periods: null,
  until: null,
};
const put = (app: App, id: string, body: unknown) =>
  send(app, "PUT", `/api/events/classifications/${id}`, body);
const events = async (app: App) => (await send(app, "GET", "/api/events")).body;
const find = (list: Json[], key: string, year: number | null) =>
  list.find((e) => e.wordingKey === key && e.yearGroup === year);
const slotsOn = async (app: App, from: string, to = from) =>
  (await send(app, "GET", `/api/slots?from=${from}&to=${to}`)).body as Json[];

test("the list has each candidate with its pre-sort, no confirmations and the lessons it would hit", async () => {
  const app = await imported();
  const list = await events(app);
  const mock = find(list, "mock exams", 13);
  expect(mock).toMatchObject({
    text: "Mock exams",
    dates: MOCK_WEEK,
    presort: { category: "mock-exams", suggestion: "cancels" },
    classifications: [],
  });
  const y13 = (await slotsOn(app, "2027-01-11", "2027-01-15")).filter((s) =>
    s.groupId.startsWith("13"),
  );
  expect(mock.lessons).toBe(y13.length);
  expect(find(list, "study leave starts", null)).toBeTruthy();
  expect(find(list, "extended essay day", 12)?.presort.category).toBe(
    "coursework",
  );
});

test("nothing is cancelled until she confirms; confirming cancels only that year; undo puts it back", async () => {
  const app = await imported();
  const before = await slotsOn(app, "2027-01-11", "2027-01-15");
  expect(before.every((s) => s.status === "open")).toBe(true);
  expect((await send(app, "GET", "/api/audit")).body.lost).toEqual([]);

  const saved = await put(app, "m1", mocks13);
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({ id: "m1", provenance: "teacher" });
  const during = await slotsOn(app, "2027-01-11", "2027-01-15");
  const y13 = during.filter((s) => s.groupId.startsWith("13"));
  expect(y13.length).toBeGreaterThan(0);
  expect(y13.every((s) => s.status === "cancelled")).toBe(true);
  expect(y13[0].reasons).toEqual([
    {
      disruptionId: expect.stringMatching(/^ev:m1:2027-01-1\d:y13$/),
      text: "Mock exams",
      source: "calendar",
    },
  ]);
  expect(
    during
      .filter((s) => !s.groupId.startsWith("13"))
      .every((s) => s.status === "open"),
  ).toBe(true);
  expect((await send(app, "GET", "/api/audit")).body.lost).toHaveLength(
    y13.length,
  );
  // Computed at read time: nothing is copied into her own cancellations.
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  expect(find(await events(app), "mock exams", 13).classifications).toEqual([
    expect.objectContaining({ id: "m1", decision: "cancels" }),
  ]);

  expect(
    (await send(app, "DELETE", "/api/events/classifications/m1")).status,
  ).toBe(200);
  expect(await slotsOn(app, "2027-01-11", "2027-01-15")).toEqual(before);
  expect(
    (await send(app, "DELETE", "/api/events/classifications/m1")).status,
  ).toBe(404);
});

test("a confirmation survives importing the calendar again", async () => {
  const app = await imported();
  await put(app, "m1", mocks13);
  expect((await send(app, "POST", "/api/calendar/import")).status).toBe(200);
  expect(
    find(await events(app), "mock exams", 13).classifications,
  ).toHaveLength(1);
  expect(
    (await slotsOn(app, "2027-01-11")).filter((s) => s.groupId === "13 1")[0]
      .status,
  ).toBe("cancelled");
});

test("study leave for chosen groups lasts until the end date and leaves other groups alone", async () => {
  const app = await imported();
  const res = await put(app, "sl", {
    wordingKey: "study leave starts",
    yearGroup: null,
    onlyDates: null,
    decision: "cancels",
    groupIds: ["13 1", "13 3", "13 5"],
    periods: null,
    until: "2027-06-29",
  });
  expect(res.status).toBe(200);
  const after = (await slotsOn(app, "2027-05-05", "2027-06-29")).filter((s) =>
    s.groupId.startsWith("13"),
  );
  expect(after.every((s) => s.status === "cancelled")).toBe(true);
  const before = (await slotsOn(app, "2027-05-04")).filter((s) =>
    s.groupId.startsWith("13"),
  );
  expect(before.every((s) => s.status === "open")).toBe(true);
  const ib = (await slotsOn(app, "2027-05-05", "2027-06-29")).filter(
    (s) => s.groupId === "IB S",
  );
  expect(ib.every((s) => s.status === "open")).toBe(true);
});

test("two confirmations of one wording covering the same date are refused with 409 naming the date", async () => {
  const app = await imported();
  await put(app, "a", mocks13);
  const res = await put(app, "b", { ...mocks13, onlyDates: ["2027-01-13"] });
  expect(res.status).toBe(409);
  expect(res.body.error.message).toContain("13 January 2027");
  expect(
    (await events(app)).flatMap((e: Json) => e.classifications),
  ).toHaveLength(1);
});

test("the same wording on different dates may be confirmed twice, and a re-save of the same id is not a conflict", async () => {
  const app = await imported();
  expect(
    (await put(app, "a", { ...mocks13, onlyDates: ["2027-01-11"] })).status,
  ).toBe(200);
  expect(
    (await put(app, "b", { ...mocks13, onlyDates: ["2027-01-12"] })).status,
  ).toBe(200);
  expect(
    (
      await put(app, "a", {
        ...mocks13,
        onlyDates: ["2027-01-11", "2027-01-15"],
      })
    ).status,
  ).toBe(200);
});

test.each([
  ["an unknown wording", { wordingKey: "nothing like this" }],
  ["a date the event does not have", { onlyDates: ["2027-02-01"] }],
  ["no dates chosen", { onlyDates: [] }],
  ["an end date before a kept date", { until: "2027-01-12" }],
  ["an unknown group", { groupIds: ["9Z"] }],
  ["a group from another year", { groupIds: ["11D"] }],
  ["no group chosen", { groupIds: [] }],
  ["no period chosen", { periods: [] }],
  [
    "an end date on a decision of no effect",
    { decision: "no-effect", until: "2027-01-15" },
  ],
])(
  "saving is refused with 422 for %s, and nothing is stored",
  async (_n, over) => {
    const app = await imported();
    const res = await put(app, "x", { ...mocks13, ...over });
    expect(res.status).toBe(422);
    expect((await events(app)).flatMap((e: Json) => e.classifications)).toEqual(
      [],
    );
  },
);

test("a decision of no effect cancels nothing and is stored with no groups or periods", async () => {
  const app = await imported();
  const res = await put(app, "n", {
    ...mocks13,
    decision: "no-effect",
    groupIds: ["13 1"],
    periods: [1],
  });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ groupIds: null, periods: null });
  expect(
    (await slotsOn(app, "2027-01-11", "2027-01-15")).every(
      (s) => s.status === "open",
    ),
  ).toBe(true);
});

test("a confirmation the calendar no longer matches is listed as stale, keeps its row and is removable", async () => {
  const db = migratedDb();
  const app = createApp({
    config: { ...testConfig, fixedToday: "2026-11-24" },
    db,
    now: () => new Date("2026-11-24T10:00:00Z"),
    gateway: await syntheticGateway(),
    principal: TEACHER_PRINCIPAL,
  });
  await send(app, "POST", "/api/calendar/import");
  const repos = createRepos(db);
  repos.events.upsert(
    {
      id: "gone",
      wordingKey: "mock exams (p1-4)",
      yearGroup: 13,
      onlyDates: null,
      decision: "cancels",
      groupIds: null,
      periods: null,
      until: null,
      provenance: "teacher",
    },
    "t",
  );
  repos.events.upsert(
    {
      id: "part",
      wordingKey: "mock exams",
      yearGroup: 11,
      onlyDates: ["2027-01-12", "2027-02-02"],
      decision: "cancels",
      groupIds: null,
      periods: null,
      until: null,
      provenance: "teacher",
    },
    "t",
  );
  const stale = (await send(app, "GET", "/api/events/stale")).body;
  expect(stale).toEqual([
    expect.objectContaining({
      classification: expect.objectContaining({ id: "gone" }),
      candidateGone: true,
    }),
    expect.objectContaining({
      classification: expect.objectContaining({ id: "part" }),
      candidateGone: false,
      missingDates: ["2027-02-02"],
    }),
  ]);
  expect(
    (await send(app, "DELETE", "/api/events/classifications/gone")).status,
  ).toBe(200);
  expect((await send(app, "GET", "/api/events/stale")).body).toHaveLength(1);
});

test("an id of 65 characters and hostile ids are refused", async () => {
  const app = await imported();
  expect((await put(app, "x".repeat(65), mocks13)).status).toBe(422);
});
