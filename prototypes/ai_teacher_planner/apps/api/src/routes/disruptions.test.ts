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
const imported = async () => {
  const app = await buildTestApp({ fixedToday: "2026-11-24" });
  expect((await send(app, "POST", "/api/calendar/import")).status).toBe(200);
  return app;
};
const photos = {
  scope: "groups",
  groupIds: ["11D"],
  from: "2026-11-24",
  to: "2026-11-24",
  periods: [3],
  reason: "School photos",
};
const slotsOn = async (app: App, date: string) =>
  (await send(app, "GET", `/api/slots?from=${date}&to=${date}`)).body;

test("the preview lists the lessons hit and stores nothing", async () => {
  const app = await imported();
  const res = await send(app, "POST", "/api/disruptions/preview", photos);
  expect(res.status).toBe(200);
  expect(res.body.hits).toEqual([
    { groupId: "11D", date: "2026-11-24", period: 3 },
  ]);
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
});

test("a whole-school day over a weekend counts only the real lessons", async () => {
  const app = await imported();
  const range = {
    scope: "school",
    from: "2026-11-21",
    to: "2026-11-22",
    periods: null,
    reason: "Weekend",
  };
  const res = await send(app, "POST", "/api/disruptions", range);
  expect(res.status).toBe(422);
  expect(res.body.error.message).toBe("No lessons fall in these dates");
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  const over = await send(app, "POST", "/api/disruptions/preview", {
    ...range,
    to: "2026-11-24",
  });
  expect(
    over.body.hits.every(
      (h: { date: string }) =>
        h.date === "2026-11-23" || h.date === "2026-11-24",
    ),
  ).toBe(true);
  expect(over.body.hits.length).toBeGreaterThan(0);
});

test("saving cancels the lesson with her reason, and removing the batch puts it back", async () => {
  const app = await imported();
  const before = await slotsOn(app, "2026-11-24");
  const res = await send(app, "POST", "/api/disruptions", {
    ...photos,
    groupIds: ["11D", "IB H"],
  });
  expect(res.status).toBe(201);
  expect(res.body).toHaveLength(2);
  const [a, b] = res.body;
  expect(a.id).toMatch(/^t:[0-9a-f-]{36}$/);
  expect(a.batchId).toBe(b.batchId);
  expect(a).toMatchObject({
    effect: "cancelled",
    source: "teacher",
    reason: "School photos",
    scope: { kind: "group", groupId: "11D" },
  });
  const during = (await slotsOn(app, "2026-11-24")) as {
    groupId: string;
    period: number;
    status: string;
    reasons: { text: string; source: string }[];
  }[];
  const hit = during.find((s) => s.groupId === "11D" && s.period === 3);
  expect(hit?.status).toBe("cancelled");
  expect(hit?.reasons).toEqual([
    expect.objectContaining({ text: "School photos", source: "teacher" }),
  ]);
  const audit = (await send(app, "GET", "/api/audit")).body;
  expect(audit.lost.map((s: { key: string }) => s.key)).toContain(
    "11D|2026-11-24|3",
  );

  const gone = await send(app, "DELETE", `/api/disruptions/batch/${a.batchId}`);
  expect(gone.status).toBe(200);
  expect(gone.body).toEqual({ removed: 2 });
  expect(await slotsOn(app, "2026-11-24")).toEqual(before);
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  expect(
    (await send(app, "DELETE", `/api/disruptions/batch/${a.batchId}`)).status,
  ).toBe(404);
});

test("a whole year takes one row; the list is sorted by from", async () => {
  const app = await imported();
  await send(app, "POST", "/api/disruptions", {
    scope: "school",
    from: "2026-11-25",
    to: "2026-11-25",
    periods: null,
    reason: "Training day",
  });
  const year = await send(app, "POST", "/api/disruptions", {
    scope: "year",
    yearGroup: 11,
    from: "2026-11-24",
    to: "2026-11-24",
    periods: null,
    reason: "Trip",
  });
  expect(year.body).toHaveLength(1);
  expect(
    (await send(app, "GET", "/api/disruptions")).body.map(
      (d: { reason: string }) => d.reason,
    ),
  ).toEqual(["Trip", "Training day"]);
});

test("a lesson cancelled twice shows both reasons and counts once", async () => {
  const app = await imported();
  await send(app, "POST", "/api/disruptions", photos);
  await send(app, "POST", "/api/disruptions", {
    ...photos,
    reason: "Fire drill",
  });
  const slot = (await slotsOn(app, "2026-11-24")).find(
    (s: { key: string }) => s.key === "11D|2026-11-24|3",
  );
  expect(slot.reasons.map((r: { text: string }) => r.text).sort()).toEqual([
    "Fire drill",
    "School photos",
  ]);
  const audit = (await send(app, "GET", "/api/audit")).body;
  expect(
    audit.lost.filter((s: { key: string }) => s.key === "11D|2026-11-24|3"),
  ).toHaveLength(1);
  const cancelled = audit.rows.reduce(
    (n: number, r: Json) => n + r.perGroup["11D"].cancelled,
    0,
  );
  expect(cancelled).toBe(1);
});

test.each([
  ["to before from", { to: "2026-11-23" }],
  ["an empty reason", { reason: "   " }],
  ["a reason of 201 characters", { reason: "x".repeat(201) }],
  ["no group chosen", { groupIds: [] }],
  ["an unknown group", { groupIds: ["9Z"] }],
  ["no period chosen", { periods: [] }],
  ["a year with no year group", { scope: "year" }],
])(
  "saving is refused with 422 for %s, and nothing is stored",
  async (_n, over) => {
    const app = await imported();
    const res = await send(app, "POST", "/api/disruptions", {
      ...photos,
      ...over,
    });
    expect(res.status).toBe(422);
    expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  },
);

test("a reason of exactly 200 characters, and hostile text, are kept as plain text", async () => {
  const app = await imported();
  const long = await send(app, "POST", "/api/disruptions", {
    ...photos,
    reason: "y".repeat(200),
  });
  expect(long.status).toBe(201);
  const html = await send(app, "POST", "/api/disruptions", {
    ...photos,
    periods: [4],
    from: "2026-11-24",
    to: "2026-11-24",
    reason: "<script>alert(1)</script>",
  });
  expect(html.status).toBe(201);
  expect(html.body[0].reason).toBe("<script>alert(1)</script>");
});

test("the preview has the same hits the save would make, and refuses a backwards range", async () => {
  const app = await imported();
  const body = {
    ...photos,
    scope: "school",
    from: "2026-11-24",
    to: "2026-11-25",
    periods: null,
  };
  const preview = await send(app, "POST", "/api/disruptions/preview", body);
  await send(app, "POST", "/api/disruptions", body);
  const lost = (await send(app, "GET", "/api/audit")).body.lost.map(
    (s: { groupId: string; date: string; period: number }) => ({
      groupId: s.groupId,
      date: s.date,
      period: s.period,
    }),
  );
  expect(preview.body.hits).toEqual(lost);
  expect(
    (
      await send(app, "POST", "/api/disruptions/preview", {
        ...body,
        to: "2026-11-01",
      })
    ).status,
  ).toBe(422);
});

test("importing the calendar again keeps what she cancelled", async () => {
  const app = await imported();
  await send(app, "POST", "/api/disruptions", photos);
  expect((await send(app, "POST", "/api/calendar/import")).status).toBe(200);
  expect((await send(app, "GET", "/api/disruptions")).body).toHaveLength(1);
  const slot = (await slotsOn(app, "2026-11-24")).find(
    (s: { key: string }) => s.key === "11D|2026-11-24|3",
  );
  expect(slot.status).toBe("cancelled");
});

test("periods are stored in numeric order", async () => {
  const app = await imported();
  const res = await send(app, "POST", "/api/disruptions", {
    scope: "school",
    from: "2026-11-24",
    to: "2026-11-24",
    periods: [6, 2, 3],
    reason: "Assembly",
  });
  expect(res.body[0].periods).toEqual([2, 3, 6]);
});
