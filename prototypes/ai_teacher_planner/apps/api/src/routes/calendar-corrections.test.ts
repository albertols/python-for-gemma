import { buildSyntheticWorkbook } from "@planner/fixtures";
import { expect, test } from "vitest";
import {
  buildTestApp,
  fakeGateway,
  SYNTHETIC_FILE,
  type syntheticGateway,
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
const imported = async (
  gateway?: Awaited<ReturnType<typeof syntheticGateway>>,
) => {
  const app = await buildTestApp({ fixedToday: "2026-11-24" }, gateway);
  expect((await send(app, "POST", "/api/calendar/import")).status).toBe(200);
  return app;
};
const dayOn = async (app: App, date: string) =>
  (await send(app, "GET", `/api/calendar/days?from=${date}&to=${date}`))
    .body[0];
const slotsOn = async (app: App, date: string) =>
  (await send(app, "GET", `/api/slots?from=${date}&to=${date}`)).body;
const label = (date: string) => `/api/calendar/corrections/labels/${date}`;
const resolution = (date: string) =>
  `/api/calendar/corrections/resolutions/${date}`;
const summary = async (app: App) =>
  (await send(app, "GET", "/api/calendar/import")).body;

test("a label correction replaces the day's label, says so, and removing it brings the calendar's back", async () => {
  const app = await imported();
  const before = await dayOn(app, "2027-05-04");
  const other = before.weekLabel === "W1" ? "W2" : "W1";
  expect(before.labelSource).toBe("calendar");

  const put = await send(app, "PUT", label("2027-05-04"), {
    weekLabel: other,
    note: "Calendar typo",
  });
  expect(put.status).toBe(200);
  expect(await dayOn(app, "2027-05-04")).toMatchObject({
    weekLabel: other,
    labelSource: "teacher",
  });
  expect((await send(app, "GET", "/api/calendar/corrections")).body).toEqual({
    labels: [{ date: "2027-05-04", weekLabel: other, note: "Calendar typo" }],
    resolutions: [],
  });

  expect((await send(app, "DELETE", label("2027-05-04"))).status).toBe(200);
  expect(await dayOn(app, "2027-05-04")).toEqual(before);
  expect((await send(app, "DELETE", label("2027-05-04"))).status).toBe(404);
});

test("a label correction moves the day's lessons to the other week's timetable", async () => {
  const app = await imported();
  const before = await slotsOn(app, "2026-11-17");
  const other =
    (await dayOn(app, "2026-11-17")).weekLabel === "W1" ? "W2" : "W1";
  await send(app, "PUT", label("2026-11-17"), { weekLabel: other, note: null });
  expect(await slotsOn(app, "2026-11-17")).not.toEqual(before);
  await send(app, "DELETE", label("2026-11-17"));
  expect(await slotsOn(app, "2026-11-17")).toEqual(before);
});

test("only a weekday in term that is in the calendar can be corrected", async () => {
  const app = await imported();
  for (const date of ["2026-10-31", "2026-09-01", "2026-08-17", "2030-01-01"]) {
    const res = await send(app, "PUT", label(date), {
      weekLabel: "W1",
      note: null,
    });
    expect(res.status, date).toBe(422);
  }
  expect(
    (await send(app, "GET", "/api/calendar/corrections")).body.labels,
  ).toEqual([]);
});

test("a note is stored as typed, but 500 characters are refused", async () => {
  const app = await imported();
  const ok = await send(app, "PUT", label("2027-05-04"), {
    weekLabel: "W1",
    note: "<script>alert(1)</script>",
  });
  expect(ok.body.note).toBe("<script>alert(1)</script>");
  const long = await send(app, "PUT", label("2027-05-04"), {
    weekLabel: "W1",
    note: "x".repeat(500),
  });
  expect(long.status).toBe(422);
  expect(
    (await send(app, "GET", "/api/calendar/corrections")).body.labels[0].note,
  ).toBe("<script>alert(1)</script>");
});

test("'no lessons' stores a school disruption day:<date>, and removing it restores the slots", async () => {
  const app = await imported();
  const before = await slotsOn(app, "2027-03-19");
  expect(before.length).toBeGreaterThan(0);
  expect(before.every((s: Json) => s.status === "open")).toBe(true);

  const put = await send(app, "PUT", resolution("2027-03-19"), {
    decision: "no-lessons",
    reason: "Staff training",
  });
  expect(put.status).toBe(200);
  const stored = (await send(app, "GET", "/api/disruptions")).body;
  expect(stored).toEqual([
    expect.objectContaining({
      id: "day:2027-03-19",
      batchId: "day:2027-03-19",
      scope: { kind: "school" },
      from: "2027-03-19",
      to: "2027-03-19",
      periods: null,
      effect: "cancelled",
      reason: "Staff training",
      source: "teacher",
    }),
  ]);
  const after = await slotsOn(app, "2027-03-19");
  expect(after).toHaveLength(before.length);
  expect(after.every((s: Json) => s.status === "cancelled")).toBe(true);
  expect(after[0].reasons[0].text).toContain("Staff training");

  expect((await send(app, "DELETE", resolution("2027-03-19"))).status).toBe(
    200,
  );
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  expect(await slotsOn(app, "2027-03-19")).toEqual(before);
});

test("'no lessons' without a reason says so in the default words", async () => {
  const app = await imported();
  await send(app, "PUT", resolution("2027-06-29"), {
    decision: "no-lessons",
    reason: "  ",
  });
  const [row] = (await send(app, "GET", "/api/disruptions")).body;
  expect(row.reason).toBe("No lessons (your correction)");
  expect(
    (await send(app, "GET", "/api/calendar/corrections")).body.resolutions[0]
      .reason,
  ).toBeNull();
});

test("'I have lessons' only clears the warning and stores no disruption", async () => {
  const app = await imported();
  const before = await slotsOn(app, "2027-05-04");
  await send(app, "PUT", resolution("2027-05-04"), {
    decision: "teaching-day",
    reason: null,
  });
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  expect(await slotsOn(app, "2027-05-04")).toEqual(before);
  const s = await summary(app);
  expect(s.shown.map((f: Json) => f.date)).not.toContain("2027-05-04");
  expect(s.resolved.map((r: Json) => r.finding.date)).toEqual(["2027-05-04"]);
  expect(s.resolved[0].resolution.decision).toBe("teaching-day");
});

test("changing a decision to 'I have lessons' takes the cancellation away", async () => {
  const app = await imported();
  await send(app, "PUT", resolution("2027-03-19"), {
    decision: "no-lessons",
    reason: "x",
  });
  await send(app, "PUT", resolution("2027-03-19"), {
    decision: "teaching-day",
    reason: null,
  });
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
});

test("a date with nothing to settle is refused", async () => {
  const app = await imported();
  const res = await send(app, "PUT", resolution("2026-11-17"), {
    decision: "no-lessons",
    reason: "x",
  });
  expect(res.status).toBe(422);
  expect(res.body.error.message).toBe(
    "There is nothing to settle on that date",
  );
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
  expect((await send(app, "DELETE", resolution("2026-11-17"))).status).toBe(
    404,
  );
});

test("the summary folds notes outside the school year into outsideYear as info", async () => {
  const app = await imported();
  const s = await summary(app);
  const dates = s.outsideYear.map((f: Json) => f.date);
  expect(dates).toEqual(
    expect.arrayContaining(["2026-08-17", "2026-10-31", "2026-07-11"]),
  );
  expect(s.outsideYear.every((f: Json) => f.severity === "info")).toBe(true);
  expect(
    s.shown.filter(
      (f: Json) => f.date >= "2026-08-01" && f.date < "2026-09-01",
    ),
  ).toEqual([]);
  expect(s.shown.map((f: Json) => f.date)).not.toContain("2026-10-31");
});

test("the day counts follow her corrections", async () => {
  const app = await imported();
  const before = (await summary(app)).counts;
  const day = await dayOn(app, "2026-11-17");
  const other = day.weekLabel === "W1" ? "W2" : "W1";
  await send(app, "PUT", label("2026-11-17"), { weekLabel: other, note: null });
  const after = (await summary(app)).counts;
  expect(after[other]).toBe(before[other] + 1);
  expect(after[day.weekLabel]).toBe(before[day.weekLabel] - 1);
});

test("importing again keeps her corrections and decisions", async () => {
  const app = await imported();
  await send(app, "PUT", label("2027-05-04"), { weekLabel: "W1", note: null });
  await send(app, "PUT", resolution("2027-03-19"), {
    decision: "no-lessons",
    reason: "Staff training",
  });
  const again = await send(app, "POST", "/api/calendar/import");
  expect(again.body.staleCorrections).toEqual([]);
  expect(again.body.resolved).toHaveLength(1);
  expect(
    (await send(app, "GET", "/api/calendar/corrections")).body.labels,
  ).toHaveLength(1);
  expect((await send(app, "GET", "/api/disruptions")).body).toHaveLength(1);
  expect((await dayOn(app, "2027-05-04")).labelSource).toBe("teacher");
});

test("a correction whose date left the calendar is an error finding until she removes it", async () => {
  const files = { [SYNTHETIC_FILE]: await buildSyntheticWorkbook() };
  const app = await imported(fakeGateway(files));
  await send(app, "PUT", label("2027-05-04"), { weekLabel: "W1", note: null });
  await send(app, "PUT", resolution("2027-06-29"), {
    decision: "teaching-day",
    reason: null,
  });
  files[SYNTHETIC_FILE] = await buildSyntheticWorkbook({
    rowsUntil: "2027-04-30",
  });
  const again = await send(app, "POST", "/api/calendar/import");
  expect(again.status).toBe(200);
  const orphans = again.body.shown.filter(
    (f: Json) => f.kind === "orphaned-correction",
  );
  expect(orphans).toEqual([
    expect.objectContaining({
      severity: "error",
      date: "2027-05-04",
      message:
        "Your correction for 2027-05-04 no longer matches a day in the calendar",
    }),
    expect.objectContaining({ severity: "error", date: "2027-06-29" }),
  ]);
  expect(again.body.staleCorrections).toEqual([
    expect.objectContaining({ type: "label", date: "2027-05-04" }),
    expect.objectContaining({ type: "resolution", date: "2027-06-29" }),
  ]);
  // Still there after a reload of the summary.
  expect((await summary(app)).staleCorrections).toHaveLength(2);

  await send(app, "DELETE", label("2027-05-04"));
  await send(app, "DELETE", resolution("2027-06-29"));
  const clean = await summary(app);
  expect(clean.staleCorrections).toEqual([]);
  expect(
    clean.shown.filter((f: Json) => f.kind === "orphaned-correction"),
  ).toEqual([]);
});

test("a genuinely mixed week is reported, a correction clears it, and removing the correction brings it back", async () => {
  const app = await imported();
  const mixed = async () =>
    (await summary(app)).shown.filter(
      (f: Json) => f.kind === "label-issue" && f.date === "2027-05-03",
    );
  // 4 May is Week 2 in the calendar; the rest of its week is Week 1.
  expect((await dayOn(app, "2027-05-04")).weekLabel).toBe("W2");
  expect(await mixed()).toHaveLength(1);
  await send(app, "PUT", label("2027-05-04"), { weekLabel: "W1", note: null });
  expect(await mixed()).toEqual([]);
  await send(app, "DELETE", label("2027-05-04"));
  expect(await mixed()).toHaveLength(1);
});

test("a label correction equal to the calendar's own label is refused", async () => {
  const app = await imported();
  const res = await send(app, "PUT", label("2027-05-04"), {
    weekLabel: "W2",
    note: null,
  });
  expect(res.status).toBe(422);
  expect(res.body.error.message).toBe("That is already the calendar's label");
  expect(
    (await send(app, "GET", "/api/calendar/corrections")).body.labels,
  ).toEqual([]);
});

test("a decision whose note the new calendar no longer raises stays visible, keeps its effect, and can be removed", async () => {
  const files = { [SYNTHETIC_FILE]: await buildSyntheticWorkbook() };
  const app = await imported(fakeGateway(files));
  await send(app, "PUT", resolution("2027-03-19"), {
    decision: "no-lessons",
    reason: "Staff training",
  });
  // The same year, but 19 March is no longer marked as a possible day off.
  files[SYNTHETIC_FILE] = await buildSyntheticWorkbook({
    clearNotesOn: ["2027-03-19"],
  });
  const again = await send(app, "POST", "/api/calendar/import");
  expect(again.body.staleCorrections).toEqual([
    expect.objectContaining({ type: "resolution", date: "2027-03-19" }),
  ]);
  expect(
    again.body.shown.filter((f: Json) => f.kind === "orphaned-correction"),
  ).toEqual([
    expect.objectContaining({
      severity: "error",
      date: "2027-03-19",
      message:
        "Your decision for 2027-03-19 no longer matches a note in the calendar",
    }),
  ]);
  expect(again.body.resolved).toEqual([]);
  // It still cancels the lessons until she removes it.
  expect(
    (await slotsOn(app, "2027-03-19")).every(
      (s: Json) => s.status === "cancelled",
    ),
  ).toBe(true);
  expect((await send(app, "DELETE", resolution("2027-03-19"))).status).toBe(
    200,
  );
  expect(
    (await slotsOn(app, "2027-03-19")).every((s: Json) => s.status === "open"),
  ).toBe(true);
  expect((await summary(app)).staleCorrections).toEqual([]);
});

test("a label correction whose date is no longer in term after a term change is stale and removable", async () => {
  const app = await imported();
  await send(app, "PUT", label("2027-05-04"), { weekLabel: "W1", note: null });
  const terms = (await send(app, "GET", "/api/terms")).body;
  const shortened = terms.map((t: Json) =>
    t.id === "T3" ? { ...t, lastPupilDay: "2027-04-30" } : t,
  );
  expect((await send(app, "PUT", "/api/terms", shortened)).status).toBe(200);
  const s = await summary(app);
  expect(s.staleCorrections).toEqual([
    {
      type: "label",
      date: "2027-05-04",
      message:
        "Your correction for 2027-05-04 is no longer on a weekday in term",
    },
  ]);
  expect(
    s.shown.filter((f: Json) => f.kind === "orphaned-correction"),
  ).toHaveLength(1);
  expect((await send(app, "DELETE", label("2027-05-04"))).status).toBe(200);
  expect((await summary(app)).staleCorrections).toEqual([]);
});

test("a finding of another kind cannot be settled", async () => {
  const app = await imported();
  // 3 May 2027 carries a mixed-week warning, which she fixes by correcting a label, not by a decision.
  const res = await send(app, "PUT", resolution("2027-05-03"), {
    decision: "no-lessons",
    reason: "x",
  });
  expect(res.status).toBe(422);
  expect(res.body.error.message).toBe(
    "There is nothing to settle on that date",
  );
  expect((await send(app, "GET", "/api/disruptions")).body).toEqual([]);
});
