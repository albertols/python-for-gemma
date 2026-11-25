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
const input = {
  code: "TEST 1",
  title: "A mock paper",
  date: "2027-06-03",
  session: "afternoon",
  durationMinutes: 75,
  groupIds: ["13 1"],
  source: null,
};

test("the three official exams are listed from the start, by date", async () => {
  const app = await buildTestApp();
  const { status, body } = await send(app, "GET", "/api/exams");
  expect(status).toBe(200);
  expect(body.map((e: Json) => e.code)).toEqual([
    "4BS1 01",
    "4BS1 02",
    "WBS14 01",
  ]);
  expect(body.every((e: Json) => typeof e.source === "string")).toBe(true);
});

test("she can add one (the API makes the id), change it and remove it", async () => {
  const app = await buildTestApp();
  const made = await send(app, "POST", "/api/exams", input);
  expect(made.status).toBe(201);
  expect(made.body).toMatchObject(input);
  const id = made.body.id as string;
  expect(id).toMatch(/^x:[\w-]{8,}$/);
  const changed = await send(app, "PUT", `/api/exams/${id}`, {
    ...input,
    title: "Changed",
    groupIds: ["13 1", "13 3"],
  });
  expect(changed.status).toBe(200);
  expect(changed.body).toMatchObject({ id, title: "Changed" });
  const list = (await send(app, "GET", "/api/exams")).body as Json[];
  expect(list.find((e) => e.id === id)?.groupIds).toEqual(["13 1", "13 3"]);
  expect((await send(app, "DELETE", `/api/exams/${id}`)).status).toBe(200);
  expect(
    ((await send(app, "GET", "/api/exams")).body as Json[]).some(
      (e) => e.id === id,
    ),
  ).toBe(false);
  expect((await send(app, "DELETE", `/api/exams/${id}`)).status).toBe(404);
  expect((await send(app, "PUT", `/api/exams/${id}`, input)).status).toBe(404);
});

test.each([
  ["a title of 121 characters", { title: "x".repeat(121) }],
  ["a code of 21 characters", { code: "x".repeat(21) }],
  ["an empty title", { title: "   " }],
  ["an empty code", { code: "" }],
  ["a group she does not teach", { groupIds: ["9Z"] }],
  ["no group", { groupIds: [] }],
  ["a date that is not real", { date: "2027-02-30" }],
  ["a length of zero", { durationMinutes: 0 }],
  ["a session of evening", { session: "evening" }],
])("%s is refused with 422 and nothing is stored", async (_n, over) => {
  const app = await buildTestApp();
  const res = await send(app, "POST", "/api/exams", { ...input, ...over });
  expect(res.status).toBe(422);
  expect(((await send(app, "GET", "/api/exams")).body as Json[]).length).toBe(
    3,
  );
});

test("a title of 120 characters and a code of 20 are kept; markup is stored as given", async () => {
  const app = await buildTestApp();
  const title = `<script>alert(1)</script>${"x".repeat(95)}`;
  expect([...title]).toHaveLength(120);
  const res = await send(app, "POST", "/api/exams", {
    ...input,
    code: "c".repeat(20),
    title,
  });
  expect(res.status).toBe(201);
  expect(res.body.title).toBe(title);
});

test("a code already in the list is refused with 409", async () => {
  const app = await buildTestApp();
  const res = await send(app, "POST", "/api/exams", {
    ...input,
    code: "WBS14 01",
  });
  expect(res.status).toBe(409);
});

test("an exam she added shows in Today's Coming up inside the look-ahead window and not beyond it", async () => {
  const app = await buildTestApp({ fixedToday: "2026-11-24" });
  const shown = async () =>
    ((await send(app, "GET", "/api/today")).body.reminders as Json[]).filter(
      (r) => r.kind === "exam",
    );
  expect(await shown()).toEqual([]);
  await send(app, "POST", "/api/exams", { ...input, date: "2026-12-08" });
  await send(app, "POST", "/api/exams", {
    ...input,
    code: "FAR",
    date: "2026-12-09",
  });
  expect(await shown()).toEqual([
    {
      kind: "exam",
      date: "2026-12-08",
      daysLeft: 14,
      label: "TEST 1 A mock paper",
      groupIds: ["13 1"],
    },
  ]);
});

const mocks13 = {
  wordingKey: "mock exams",
  yearGroup: 13,
  onlyDates: [
    "2027-01-11",
    "2027-01-12",
    "2027-01-13",
    "2027-01-14",
    "2027-01-15",
  ],
  decision: "cancels",
  groupIds: null,
  periods: null,
  until: null,
};
const studyLeave = {
  wordingKey: "study leave starts",
  yearGroup: null,
  onlyDates: ["2027-05-05", "2027-05-11"],
  decision: "cancels",
  groupIds: ["13 1", "13 3", "13 5"],
  periods: null,
  until: "2027-06-29",
};

test("the audit says what will not run, by reason, and each group's last lesson", async () => {
  const app = await buildTestApp({ fixedToday: "2026-11-24" });
  await send(app, "POST", "/api/calendar/import");
  const before = (await send(app, "GET", "/api/audit")).body;
  expect(before.lostByReason).toEqual([]);
  expect(before.lastLesson["13 1"]).toMatch(/^2027-0[5-7]/);
  await send(app, "PUT", "/api/events/classifications/m", mocks13);
  await send(app, "PUT", "/api/events/classifications/s", studyLeave);
  const audit = (await send(app, "GET", "/api/audit")).body;
  const reasons = audit.lostByReason as Json[];
  expect(reasons.map((r) => r.reason).sort()).toEqual([
    "Mock exams",
    "Study leave starts",
  ]);
  const mock = reasons.find((r) => r.reason === "Mock exams");
  expect(Object.keys(mock.perGroup).sort()).toEqual(["13 1", "13 3", "13 5"]);
  expect(reasons[0].reason).toBe("Study leave starts");
  const lost13 = (audit.lost as Json[]).length;
  const counted = reasons.reduce(
    (n: number, r: Json) =>
      n + (Object.values(r.perGroup) as number[]).reduce((a, b) => a + b, 0),
    0,
  );
  // No lesson has two reasons here, so the reasons add up to the lost list.
  expect(counted).toBe(lost13);
  // Study leave starts after 4 May; the last open Year 13 lesson is on or before it.
  expect(audit.lastLesson["13 1"] <= "2027-05-04").toBe(true);
  expect(audit.lastLesson["11D"] > "2027-05-04").toBe(true);
  // A day off during study leave does not list Year 13 as missed.
  const during = (audit.daysOff as Json[]).filter(
    (d) => d.date > "2027-05-04" && d.date <= "2027-06-29",
  );
  expect(during.length).toBeGreaterThan(0);
  for (const d of during)
    expect(d.wouldHaveHad.some((m: Json) => m.groupId.startsWith("13 "))).toBe(
      false,
    );
});
