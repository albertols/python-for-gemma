import { buildSyntheticWorkbook } from "@planner/fixtures";
import { expect, test } from "vitest";
import { createApp } from "../app.ts";
import {
  buildTestApp,
  fakeGateway,
  migratedDb,
  SYNTHETIC_FILE,
  syntheticGateway,
  testConfig,
} from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;
const get = async (app: App, url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as Json };
};
const send = async (app: App, method: string, url: string, body: unknown) => {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
};
const imported = async (today: string) => {
  const app = await buildTestApp({ fixedToday: today });
  expect(
    (await app.request("/api/calendar/import", { method: "POST" })).status,
  ).toBe(200);
  return app;
};

test("first run seeds the timetable, groups and terms", async () => {
  const app = await buildTestApp();
  const { body } = await get(app, "/api/timetable");
  expect(body.versions).toHaveLength(1);
  expect(body.groups).toHaveLength(6);
  expect(
    (await get(app, "/api/terms")).body.map((t: { id: string }) => t.id),
  ).toEqual(["T1", "T2", "T3"]);
});

test("import stores the rows and returns the counts", async () => {
  const app = await buildTestApp();
  const res = await send(app, "POST", "/api/calendar/import", undefined);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.counts.W1).toBeGreaterThan(0);
  expect(res.body.counts.W2).toBeGreaterThan(0);
  expect((await get(app, "/api/calendar/import")).body.counts).toEqual(
    res.body.counts,
  );
  const days = await get(
    app,
    "/api/calendar/days?from=2027-02-22&to=2027-02-22",
  );
  expect(days.body).toHaveLength(1);
  expect(days.body[0]).toMatchObject({ weekLabel: "W1", kind: "pupil" });
});

test("importing again replaces the calendar, report windows and parents' evenings", async () => {
  const db = migratedDb();
  const full = await buildSyntheticWorkbook();
  const files = { [SYNTHETIC_FILE]: full };
  const app = createApp({
    config: { ...testConfig, fixedToday: "2026-11-19" },
    db,
    now: () => new Date("2026-11-24T10:00:00Z"),
    gateway: fakeGateway(files),
  });
  const count = (table: string) =>
    (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
  const post = () => app.request("/api/calendar/import", { method: "POST" });

  expect((await post()).status).toBe(200);
  const rowsBefore = count("calendar_rows");
  expect(count("report_windows")).toBeGreaterThan(0);
  expect(count("parents_evenings")).toBeGreaterThan(0);
  expect((await post()).status).toBe(200);
  expect(count("calendar_rows")).toBe(rowsBefore);

  files[SYNTHETIC_FILE] = await buildSyntheticWorkbook({
    rowsUntil: "2026-12-22",
    reportDates: "none",
  });
  const smaller = await post();
  expect(smaller.status).toBe(200);
  expect(((await smaller.json()) as Json).ok).toBe(true);
  expect(count("calendar_rows")).toBeLessThan(rowsBefore);
  expect(db.prepare("select max(date) as d from calendar_rows").get()).toEqual({
    d: "2026-12-22",
  });
  expect(count("report_windows")).toBe(0);
  expect(count("parents_evenings")).toBe(0);
});

test("unreadable report and parents' evening dates are listed with their text", async () => {
  const bytes = await buildSyntheticWorkbook({ reportDates: "unreadable" });
  const app = await buildTestApp({}, fakeGateway({ [SYNTHETIC_FILE]: bytes }));
  const posted = await send(app, "POST", "/api/calendar/import", undefined);
  const expected = [
    {
      id: expect.stringMatching(/^pe-/),
      kind: "parents-evening",
      label: "Year 11 Parent Meeting",
      field: "date",
      raw: "Parent Meeting: sometime soon",
    },
    {
      id: expect.stringMatching(/^rw-/),
      kind: "report-window",
      label: "Year 7 Report 1: Short",
      field: "dataDeadline",
      raw: "sometime in March",
    },
  ];
  expect(posted.body.reportIssues).toEqual(expected);
  // The raw text survives the database: the stored summary says the same.
  expect((await get(app, "/api/calendar/import")).body.reportIssues).toEqual(
    expected,
  );
});

test("a corrected report date and parents' evening date leave the issue list", async () => {
  const bytes = await buildSyntheticWorkbook({ reportDates: "unreadable" });
  const app = await buildTestApp({}, fakeGateway({ [SYNTHETIC_FILE]: bytes }));
  const { body } = await send(app, "POST", "/api/calendar/import", undefined);
  const win = body.reportIssues.find((i: Json) => i.kind === "report-window");
  const eve = body.reportIssues.find((i: Json) => i.kind === "parents-evening");

  const w = await send(app, "PUT", `/api/reports/windows/${win.id}/date`, {
    field: win.field,
    date: "2027-03-12",
  });
  expect(w.status).toBe(200);
  expect(w.body.reportIssues.map((i: Json) => i.id)).toEqual([eve.id]);
  const e = await send(app, "PUT", `/api/reports/evenings/${eve.id}/date`, {
    date: "2027-02-04",
  });
  expect(e.status).toBe(200);
  expect(e.body.reportIssues).toEqual([]);
  expect((await get(app, "/api/calendar/import")).body.reportIssues).toEqual(
    [],
  );
});

test("correcting a report date refuses unknown rows and unreal dates", async () => {
  const bytes = await buildSyntheticWorkbook({ reportDates: "unreadable" });
  const app = await buildTestApp({}, fakeGateway({ [SYNTHETIC_FILE]: bytes }));
  await send(app, "POST", "/api/calendar/import", undefined);
  const missing = await send(app, "PUT", "/api/reports/windows/nope/date", {
    field: "dataDeadline",
    date: "2027-03-12",
  });
  expect(missing.status).toBe(404);
  const missingEvening = await send(
    app,
    "PUT",
    "/api/reports/evenings/nope/date",
    {
      date: "2027-03-12",
    },
  );
  expect(missingEvening.status).toBe(404);
  const bad = await send(app, "PUT", "/api/reports/evenings/pe-001/date", {
    date: "2027-02-30",
  });
  expect(bad.status).toBe(422);
});

test("a clean workbook has no report issues", async () => {
  const app = await buildTestApp();
  const res = await send(app, "POST", "/api/calendar/import", undefined);
  expect(res.body.reportIssues).toEqual([]);
});

test("importing a workbook with a renamed header stores nothing", async () => {
  const bytes = await buildSyntheticWorkbook({
    renameHeader: { from: "Week1/2", to: "Week" },
  });
  const app = await buildTestApp({}, fakeGateway({ [SYNTHETIC_FILE]: bytes }));
  const res = await send(app, "POST", "/api/calendar/import", undefined);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(false);
  expect(res.body.findings.length).toBeGreaterThan(0);
  expect((await get(app, "/api/calendar/import")).body).toBeNull();
});

test("no workbook gives 422 with a message she can act on", async () => {
  const app = await buildTestApp({}, fakeGateway({}));
  const res = await send(app, "POST", "/api/calendar/import", undefined);
  expect(res.status).toBe(422);
  expect(res.body.error.message).toContain("Secondary Calendar");
});

test("two workbooks give 422 listing both names", async () => {
  const bytes = await buildSyntheticWorkbook();
  const app = await buildTestApp(
    {},
    fakeGateway({
      "A Secondary Calendar.xlsx": bytes,
      "B Secondary Calendar.xlsx": bytes,
    }),
  );
  const res = await send(app, "POST", "/api/calendar/import", undefined);
  expect(res.status).toBe(422);
  expect(res.body.error.message).toContain("A Secondary Calendar.xlsx");
  expect(res.body.error.message).toContain("B Secondary Calendar.xlsx");
});

test("a workbook the gateway refuses to read gives 422 naming the file only", async () => {
  const gateway = await syntheticGateway();
  gateway.read = async (p) => {
    const { ResourceDenied } = await import("../gateway/resource-gateway.ts");
    throw new ResourceDenied(p);
  };
  const app = await buildTestApp({}, gateway);
  const res = await send(app, "POST", "/api/calendar/import", undefined);
  expect(res.status).toBe(422);
  expect(res.body.error.message).toContain(SYNTHETIC_FILE);
});

test("slots for the week of 22 Feb 2027 are Week 1 slots", async () => {
  const app = await imported("2027-02-22");
  const { body } = await get(app, "/api/slots?from=2027-02-22&to=2027-02-26");
  expect(body).toHaveLength(17);
  expect(body.every((s: { weekLabel: string }) => s.weekLabel === "W1")).toBe(
    true,
  );
  const one = await get(
    app,
    "/api/slots?from=2027-02-22&to=2027-02-26&groupId=11D",
  );
  expect(one.body.every((s: { groupId: string }) => s.groupId === "11D")).toBe(
    true,
  );
});

test("fortnights and audit are served", async () => {
  const app = await imported("2026-11-19");
  expect((await get(app, "/api/fortnights")).body.length).toBeGreaterThan(10);
  const audit = (await get(app, "/api/audit")).body;
  expect(audit.rows.length).toBeGreaterThan(0);
  expect(audit.lost).toEqual([]);
});

test("today on a teaching day lists that day's lessons with times", async () => {
  const app = await imported("2026-11-19");
  const { body } = await get(app, "/api/today");
  expect(body).toMatchObject({
    date: "2026-11-19",
    kind: "pupil",
    weekLabel: "W1",
  });
  expect(
    body.lessons.map((l: Json) => [
      l.slot.groupId,
      l.slot.period,
      l.start,
      l.end,
    ]),
  ).toEqual([
    ["IB S", 1, "08:45", "09:40"],
    ["IB S", 2, "09:40", "10:35"],
    ["13 3", 3, "11:15", "12:10"],
    ["13 3", 4, "12:10", "13:05"],
    ["13 5", 6, "15:30", "16:25"],
  ]);
});

test("today on a Saturday has no lessons and names the next teaching day", async () => {
  const { body } = await get(await imported("2026-11-21"), "/api/today");
  expect(body).toMatchObject({
    kind: "weekend",
    lessons: [],
    nextTeachingDay: "2026-11-23",
  });
});

test("today in the winter holiday names the lone Friday", async () => {
  const { body } = await get(await imported("2026-12-28"), "/api/today");
  expect(body.nextTeachingDay).toBe("2027-01-08");
});

test("today after the last day of the year has no next teaching day", async () => {
  const res = await get(await imported("2027-07-10"), "/api/today");
  expect(res.status).toBe(200);
  expect(res.body.nextTeachingDay).toBeNull();
});

test("the last teaching day names no next day, and the day before names it", async () => {
  const slots = (await get(await imported("2027-07-10"), "/api/slots")).body;
  const dates: string[] = [...new Set<string>(slots.map((x: Json) => x.date))];
  const last = dates[dates.length - 1] as string;
  const before = dates[dates.length - 2] as string;
  expect(
    (await get(await imported(last), "/api/today")).body.nextTeachingDay,
  ).toBeNull();
  expect(
    (await get(await imported(before), "/api/today")).body.nextTeachingDay,
  ).toBe(last);
});

test("today before any import says so instead of failing", async () => {
  const res = await get(
    await buildTestApp({ fixedToday: "2026-11-19" }),
    "/api/today",
  );
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    kind: "no-calendar",
    lessons: [],
    nextTeachingDay: null,
  });
});

test("today carries the reminder ten days ahead", async () => {
  const { body } = await get(await imported("2026-11-20"), "/api/today");
  const r = body.reminders.find(
    (x: Json) => x.kind === "report-data-deadline" && x.daysLeft === 10,
  );
  expect(r).toBeDefined();
  expect(r.label).toContain("Year 11");
});

test("saving a timetable with two groups in one period is refused", async () => {
  const app = await buildTestApp();
  const before = (await get(app, "/api/timetable")).body;
  const v = before.versions[0];
  const first = v.entries[0];
  const clash = {
    ...first,
    groupId: v.entries.find((e: Json) => e.groupId !== first.groupId).groupId,
  };
  const res = await send(app, "PUT", `/api/timetable/${v.id}`, {
    entries: [...v.entries, clash],
    duties: v.duties,
  });
  expect(res.status).toBe(422);
  expect(res.body.error.issues.join(" ")).toContain("share one period");
  expect((await get(app, "/api/timetable")).body).toEqual(before);
});

test("a valid timetable is saved", async () => {
  const app = await buildTestApp();
  const v = (await get(app, "/api/timetable")).body.versions[0];
  const res = await send(app, "PUT", `/api/timetable/${v.id}`, {
    entries: v.entries.slice(1),
    duties: v.duties,
  });
  expect(res.status).toBe(200);
  expect(
    (await get(app, "/api/timetable")).body.versions[0].entries,
  ).toHaveLength(v.entries.length - 1);
});

test("a timetable version can be added from a date, once", async () => {
  const app = await buildTestApp();
  const v = (await get(app, "/api/timetable")).body.versions[0];
  const made = await send(app, "POST", "/api/timetable/versions", {
    validFrom: "2027-01-08",
    copyOf: v.id,
  });
  expect(made.status).toBe(201);
  expect(made.body.entries).toEqual(v.entries);
  const again = await send(app, "POST", "/api/timetable/versions", {
    validFrom: "2027-01-08",
    copyOf: v.id,
  });
  expect(again.status).toBe(422);
  const missing = await send(app, "POST", "/api/timetable/versions", {
    validFrom: "2027-02-01",
    copyOf: "nope",
  });
  expect(missing.status).toBe(404);
  const list = (await get(app, "/api/timetable")).body.versions.map(
    (x: Json) => x.validFrom,
  );
  expect(list).toEqual(["2026-08-31", "2027-01-08"]);
});

test("saving terms that overlap is refused", async () => {
  const app = await buildTestApp();
  const res = await send(app, "PUT", "/api/terms", [
    { id: "T1", firstPupilDay: "2026-09-04", lastPupilDay: "2027-01-10" },
    { id: "T2", firstPupilDay: "2027-01-08", lastPupilDay: "2027-03-19" },
    { id: "T3", firstPupilDay: "2027-04-05", lastPupilDay: "2027-06-29" },
  ]);
  expect(res.status).toBe(422);
  expect(res.body.error.issues.join(" ")).toContain("overlap");
});

test("a term that ends before it starts is refused, and good terms are saved", async () => {
  const app = await buildTestApp();
  const backwards = await send(app, "PUT", "/api/terms", [
    { id: "T1", firstPupilDay: "2026-12-22", lastPupilDay: "2026-09-04" },
    { id: "T2", firstPupilDay: "2027-01-08", lastPupilDay: "2027-03-19" },
    { id: "T3", firstPupilDay: "2027-04-05", lastPupilDay: "2027-06-29" },
  ]);
  expect(backwards.status).toBe(422);
  const ok = await send(app, "PUT", "/api/terms", [
    { id: "T3", firstPupilDay: "2027-04-06", lastPupilDay: "2027-06-29" },
    { id: "T1", firstPupilDay: "2026-09-04", lastPupilDay: "2026-12-22" },
    { id: "T2", firstPupilDay: "2027-01-08", lastPupilDay: "2027-03-19" },
  ]);
  expect(ok.status).toBe(200);
  expect(ok.body.map((t: Json) => t.id)).toEqual(["T1", "T2", "T3"]);
  expect((await get(app, "/api/terms")).body[2].firstPupilDay).toBe(
    "2027-04-06",
  );
});

test("a bad query is a 422 with a readable message", async () => {
  const res = await get(await buildTestApp(), "/api/slots?from=tomorrow");
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe("invalid-request");
  expect(res.body.error.message).toContain("from");
});

test("the OpenAPI document lists every route above", async () => {
  const doc = (await get(await buildTestApp(), "/openapi.json")).body;
  const listed = Object.entries(doc.paths).flatMap(([p, ops]) =>
    Object.keys(ops as object).map((m) => `${m.toUpperCase()} ${p}`),
  );
  expect(listed).toEqual(
    expect.arrayContaining([
      "POST /api/calendar/import",
      "GET /api/calendar/import",
      "GET /api/calendar/days",
      "GET /api/terms",
      "PUT /api/terms",
      "GET /api/timetable",
      "PUT /api/timetable/{id}",
      "POST /api/timetable/versions",
      "GET /api/slots",
      "GET /api/fortnights",
      "GET /api/audit",
      "GET /api/today",
    ]),
  );
});
