import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fitFor, type PlanInputs } from "@planner/domain";
import { syntheticPack, syntheticScheme } from "@planner/fixtures";
import { packHash } from "@planner/importers";
import { afterAll, expect, test } from "vitest";
import { buildTestApp } from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;

const COURSE = "ial-business-u4";
const GROUPS = ["13 1", "13 3", "13 5"];
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const send = async (app: App, method: string, url: string, body?: unknown) => {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
};
const get = (app: App, url: string) => send(app, "GET", url);

/** A planner on a temporary data folder, reset by the test route to `state`, with today fixed. */
async function planner(state: string | null, today = "2026-11-20") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-plans-"));
  dirs.push(dataDir);
  const app = await buildTestApp({
    fixedToday: today,
    dataDir,
    testRoutes: true,
  });
  const res = await app.request("/api/test/reset", {
    method: "POST",
    headers: { "x-planner-test": "1", "content-type": "application/json" },
    body: JSON.stringify(state === null ? {} : { state }),
  });
  expect(res.status).toBe(200);
  return { app, dataDir };
}
const propose = async (app: App) => {
  const res = await send(app, "POST", `/api/plans/${COURSE}/proposals`);
  expect(res.status).toBe(200);
  return res.body;
};
const accept = (app: App, p: Json) =>
  send(app, "POST", `/api/plans/${COURSE}/accept`, {
    baseRevisionId: p.baseRevisionId,
    candidateKey: p.candidateKey,
  });
const status = async (app: App) =>
  (await get(app, `/api/plans/${COURSE}`)).body;
const positionsAt = (nextLessonId: string) => ({
  positions: GROUPS.map((groupId) => ({
    groupId,
    nextLessonId,
    doneItemIds: [],
    asOf: "2026-11-20",
  })),
});
const date = (slotKey: string) => slotKey.split("|")[1] ?? "";

test("a scheme cannot be saved before the pack is locked", async () => {
  const { app } = await planner("m2-draft-pack");
  const res = await send(app, "PUT", `/api/scheme/${COURSE}`, {
    items: syntheticScheme(COURSE),
    overrides: [],
  });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("pack-not-locked");
  expect((await get(app, `/api/scheme/${COURSE}`)).body.items).toEqual([]);
});

test("the first proposal, accepted, becomes the head", async () => {
  const { app } = await planner("m2-no-positions");
  expect((await status(app)).head).toBeNull();
  expect(
    (await send(app, "PUT", `/api/positions/${COURSE}`, positionsAt("ch1#1")))
      .status,
  ).toBe(200);
  const p = await propose(app);
  expect(p).toMatchObject({
    planId: COURSE,
    baseRevisionId: null,
    before: null,
  });
  expect(p.candidateKey).toMatch(/^[0-9a-f]{64}$/);
  expect(p.candidate.placements.length).toBeGreaterThan(0);
  // a proposal stores nothing
  expect((await status(app)).head).toBeNull();

  const res = await accept(app, p);
  expect(res.status).toBe(200);
  const now = await status(app);
  expect(now.head).toMatchObject({ planId: COURSE, parentId: null });
  expect(now.head.snapshot).toEqual(p.candidate);
  expect(now.canUndo).toBe(false);
  expect(now.upToDate).toBe(true);
});

test("accepting with an old base is refused and the head does not change", async () => {
  const { app } = await planner("m2-planned");
  const base = (await status(app)).head.id;
  // two proposals from one head; accept the first; accept the second: 409 stale-proposal
  const first = await propose(app);
  const second = await propose(app);
  expect(first.baseRevisionId).toBe(base);
  expect(second.baseRevisionId).toBe(base);
  expect((await accept(app, first)).status).toBe(200);
  const head = (await status(app)).head;
  expect(head.parentId).toBe(base);
  const refused = await accept(app, second);
  expect(refused.status).toBe(409);
  expect(refused.body.error.code).toBe("stale-proposal");
  expect((await status(app)).head).toEqual(head);
});

test("accepting after the scheme changed is refused, because what she saw is no longer what would be stored", async () => {
  const { app } = await planner("m2-planned");
  const head = (await status(app)).head;
  // proposal; PUT scheme; accept with the old candidateKey: 409
  const p = await propose(app);
  const scheme = (await get(app, `/api/scheme/${COURSE}`)).body;
  const items = scheme.items.map((i: Json) =>
    i.id === "ch4" ? { ...i, lessons: 3 } : i,
  );
  expect(
    (await send(app, "PUT", `/api/scheme/${COURSE}`, { items, overrides: [] }))
      .status,
  ).toBe(200);
  const refused = await accept(app, p);
  expect(refused.status).toBe(409);
  expect(refused.body.error.code).toBe("stale-proposal");
  expect((await status(app)).head).toEqual(head);
  // a fresh proposal of the changed scheme is accepted
  expect((await accept(app, await propose(app))).status).toBe(200);
});

test("undo restores the previous head exactly, and a second undo with nothing left is refused", async () => {
  const { app } = await planner("m2-planned");
  const before = await status(app);
  expect(before.canUndo).toBe(false);
  const scheme = (await get(app, `/api/scheme/${COURSE}`)).body;
  await send(app, "PUT", `/api/scheme/${COURSE}`, {
    items: scheme.items.map((i: Json) =>
      i.id === "ch3" ? { ...i, lessons: 6 } : i,
    ),
    overrides: [],
  });
  expect((await accept(app, await propose(app))).status).toBe(200);
  const after = await status(app);
  expect(after.canUndo).toBe(true);
  expect(after.head.snapshot).not.toEqual(before.head.snapshot);

  const undone = await send(app, "POST", `/api/plans/${COURSE}/undo`);
  expect(undone.status).toBe(200);
  const back = await status(app);
  expect(back.head).toEqual(before.head);
  expect(back.canUndo).toBe(false);
  const again = await send(app, "POST", `/api/plans/${COURSE}/undo`);
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe("nothing-to-undo");
  expect((await status(app)).head).toEqual(before.head);
});

test("placements for a week return titles and states for the board", async () => {
  const { app } = await planner("m2-planned");
  const week = (await get(app, "/api/placements?from=2026-11-09&to=2026-11-13"))
    .body;
  const titles: Record<string, string> = {
    ch1: "Demand",
    ch2: "Supply",
    ch3: "Markets",
    ch4: "Prices",
  };
  expect(week.placements.length).toBeGreaterThan(0);
  expect(new Set(week.placements.map((p: Json) => p.groupId))).toEqual(
    new Set(GROUPS),
  );
  for (const p of week.placements) {
    expect(p.date >= "2026-11-09" && p.date <= "2026-11-13").toBe(true);
    // today is 20 Nov: a past lesson with no answer from her is assumed
    expect(p).toMatchObject({ courseId: COURSE, state: "assumed" });
    if (p.lessonId.startsWith("flex:"))
      expect(p).toMatchObject({
        kind: "flex",
        title: "Spare lesson",
        provenance: { origin: "engine" },
      });
    else
      expect(p).toMatchObject({
        kind: "teaching",
        title: titles[p.itemId],
        provenance: { origin: "import" },
      });
  }
  // each group's lessons run forward in scheme order through the week
  for (const g of GROUPS) {
    const ids = week.placements
      .filter((p: Json) => p.groupId === g && !p.lessonId.startsWith("flex:"))
      .map((p: Json) => p.lessonId);
    const order = syntheticScheme(COURSE)
      .filter((i) => i.kind === "teaching")
      .flatMap((i) =>
        Array.from({ length: i.lessons }, (_, n) => `${i.id}#${n + 1}`),
      );
    expect(ids).toEqual(
      [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    );
  }
  expect(week.assessments).toEqual([]);
  // a week still ahead is planned, spare lesson included
  const ahead = (
    await get(app, "/api/placements?from=2026-11-23&to=2026-11-27")
  ).body;
  expect(ahead.placements.length).toBeGreaterThan(0);
  expect(ahead.placements.every((p: Json) => p.state === "planned")).toBe(true);
  expect(ahead.placements).toContainEqual(
    expect.objectContaining({
      lessonId: "flex:13 3:cp:a-ch2#1",
      slotKey: "13 3|2026-11-26|4",
      state: "planned",
      title: "Spare lesson",
    }),
  );
  // the stored head is not changed by what the board shows
  expect(
    (await status(app)).head.snapshot.placements.find(
      (p: Json) => p.slotKey === week.placements[0].slotKey,
    ).state,
  ).toBe("planned");
  const test = (await get(app, "/api/placements?from=2026-11-27&to=2026-12-01"))
    .body;
  expect(
    test.assessments.map((a: Json) => [
      a.groupId,
      a.itemId,
      a.date,
      a.slotUse,
      a.title,
    ]),
  ).toEqual([
    // by slot: 13 5 sits it in P4 and 13 1 in P6 on 27 Nov; 13 3 has no lesson again until 1 Dec
    ["13 5", "a-ch2", "2026-11-27", "whole", "20 mark"],
    ["13 1", "a-ch2", "2026-11-27", "whole", "20 mark"],
    ["13 3", "a-ch2", "2026-12-01", "whole", "20 mark"],
  ]);
});

test("check-in lists assumed lessons by week, oldest first", async () => {
  // fixedToday three weeks after the plan
  const { app } = await planner("m2-planned");
  const { weeks } = (await get(app, "/api/checkin")).body;
  expect(weeks.map((w: Json) => w.weekOf)).toEqual([
    "2026-10-26",
    "2026-11-09",
    "2026-11-16",
  ]);
  const listed = weeks.flatMap((w: Json) => w.lessons);
  // every content lesson of the head before today, and nothing else
  const head = (await status(app)).head.snapshot;
  const past = head.placements.filter(
    (p: Json) =>
      p.slotKey !== null &&
      date(p.slotKey) < "2026-11-20" &&
      !p.lessonId.startsWith("flex:"),
  );
  expect(
    listed.map((l: Json) => `${l.groupId} ${l.lessonId} ${l.slotKey}`).sort(),
  ).toEqual(
    past.map((p: Json) => `${p.groupId} ${p.lessonId} ${p.slotKey}`).sort(),
  );
  for (const w of weeks) {
    const dates = w.lessons.map((l: Json) => l.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d: string) => d >= w.weekOf)).toBe(true);
  }
  expect(listed[0]).toMatchObject({
    courseId: COURSE,
    lessonId: "ch1#1",
    title: "Demand",
    date: "2026-10-26",
  });
});

test("confirming a week writes one log entry per lesson and they leave the check-in", async () => {
  const { app } = await planner("m2-planned");
  const [first] = (await get(app, "/api/checkin")).body.weeks;
  const entries = first.lessons.map((l: Json) => ({
    groupId: l.groupId,
    lessonId: l.lessonId,
    outcome: "taught",
    note: null,
  }));
  expect(entries.length).toBeGreaterThan(0);
  const res = await send(app, "POST", "/api/checkin", { entries });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ written: entries.length, outOfDate: [] });
  expect(
    (await get(app, "/api/checkin")).body.weeks.map((w: Json) => w.weekOf),
  ).toEqual(["2026-11-09", "2026-11-16"]);
  // taught as planned: the plan is still the plan
  expect((await status(app)).upToDate).toBe(true);
  // a lesson that is not waiting for her is refused, and nothing is written
  const again = await send(app, "POST", "/api/checkin", {
    entries: entries.slice(0, 1),
  });
  expect(again.status).toBe(422);
  expect(again.body.error.code).toBe("not-assumed");
});

test("logging a skip leaves the plan not up to date and offers a proposal", async () => {
  const { app } = await planner("m2-planned");
  expect((await status(app)).upToDate).toBe(true);
  const [week] = (await get(app, "/api/checkin")).body.weeks;
  const lesson = week.lessons.find((l: Json) => l.groupId === "13 1");
  const res = await send(app, "POST", "/api/checkin", {
    entries: [
      {
        groupId: "13 1",
        lessonId: lesson.lessonId,
        outcome: "skipped",
        note: "Fire drill",
      },
    ],
  });
  expect(res.body).toEqual({ written: 1, outOfDate: [COURSE] });
  expect((await status(app)).upToDate).toBe(false);
  const p = await propose(app);
  expect(p.diff.entries).toContainEqual(
    expect.objectContaining({
      groupId: "13 1",
      lessonId: lesson.lessonId,
      change: "correction",
      toState: "skipped",
    }),
  );
});

test("positions for a lesson that does not exist are refused with the valid ids near it", async () => {
  const { app } = await planner("m2-no-positions");
  const body = positionsAt("ch1#1");
  body.positions[0] = { ...body.positions[0], nextLessonId: "ch2#9" } as never;
  const res = await send(app, "PUT", `/api/positions/${COURSE}`, body);
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe("unknown-lesson");
  expect(res.body.error.issues).toEqual([
    '13 1: "ch2#9" is not one of its lessons. Lessons near it: ch2#1, ch2#2, ch2#3, ch2#4.',
  ]);
  expect((await get(app, `/api/positions/${COURSE}`)).body).toEqual([]);
});

test("the check-in never lists a past spare lesson", async () => {
  // a spare lesson dated before today is dropped (Task 2.4), so it is not 'assumed' and not offered
  const { app } = await planner("m2-planned", "2026-12-09");
  const head = (await status(app)).head.snapshot;
  const pastSpare = head.placements.filter(
    (p: Json) =>
      p.lessonId.startsWith("flex:") && date(p.slotKey) < "2026-12-09",
  );
  expect(pastSpare.length).toBeGreaterThan(0);
  const listed = (await get(app, "/api/checkin")).body.weeks.flatMap(
    (w: Json) => w.lessons,
  );
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.some((l: Json) => l.lessonId.startsWith("flex:"))).toBe(false);
});

test("a confirmed event that cancels a head placement's slot leaves the plan not up to date", async () => {
  // upToDate false; the plan is unchanged until she accepts
  const { app } = await planner("m2-planned");
  const before = await status(app);
  expect(before.upToDate).toBe(true);
  const mockWeek = before.head.snapshot.placements.filter(
    (p: Json) =>
      p.slotKey !== null &&
      date(p.slotKey) >= "2027-01-11" &&
      date(p.slotKey) <= "2027-01-15",
  );
  expect(mockWeek.length).toBeGreaterThan(0);
  const confirmed = await send(app, "PUT", "/api/events/classifications/m1", {
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
  });
  expect(confirmed.status).toBe(200);
  const after = await status(app);
  expect(after.upToDate).toBe(false);
  expect(after.head).toEqual(before.head);
});

test("revisionWeeks comes from the course and reaches the engine", async () => {
  // PUT /api/courses/ial-business-u4 { revisionWeeks: 0 }: the next proposal has no cp:revision
  const { app } = await planner("m2-planned");
  const hasRevision = (p: Json) =>
    p.candidate.checkpoints.some((c: Json) => c.id === "cp:revision") ||
    p.candidate.placements.some((x: Json) =>
      x.lessonId.includes(":cp:revision#"),
    );
  expect(hasRevision(await propose(app))).toBe(true);
  const put = await send(app, "PUT", `/api/courses/${COURSE}`, {
    revisionWeeks: 0,
  });
  expect(put.status).toBe(200);
  expect(put.body).toMatchObject({ id: COURSE, revisionWeeks: 0 });
  expect(hasRevision(await propose(app))).toBe(false);
  for (const bad of [-1, 1.5])
    expect(
      (await send(app, "PUT", `/api/courses/${COURSE}`, { revisionWeeks: bad }))
        .status,
    ).toBe(422);
  expect(
    (await send(app, "PUT", "/api/courses/nope", { revisionWeeks: 1 })).status,
  ).toBe(404);
});

test("the reset takes a state and the default stays m1b", async () => {
  // reset { state: 'm2-planned' } then reset with no body: M2 tables empty, data/packs and data/materials empty
  const { app, dataDir } = await planner("m2-planned");
  const courses = async () =>
    Object.fromEntries(
      (await get(app, "/api/courses")).body.map((c: Json) => [c.id, c]),
    );
  expect((await courses())[COURSE]).toMatchObject({
    pack: "locked",
    hasPlan: true,
  });
  expect(fs.readdirSync(path.join(dataDir, "packs")).length).toBeGreaterThan(0);
  fs.mkdirSync(path.join(dataDir, "materials", "13 1"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "materials", "13 1", "notes.pdf"), "x");

  const res = await app.request("/api/test/reset", {
    method: "POST",
    headers: { "x-planner-test": "1" },
  });
  expect(res.status).toBe(200);
  const after = await courses();
  expect(Object.keys(after)).toEqual([COURSE, "ib-business", "igcse-business"]);
  for (const c of Object.values(after) as Json[])
    expect(c).toMatchObject({ pack: "none", hasPlan: false });
  expect(after[COURSE].groups.map((g: Json) => g.id)).toEqual(GROUPS);
  expect((await get(app, `/api/scheme/${COURSE}`)).body.items).toEqual([]);
  expect((await get(app, `/api/positions/${COURSE}`)).body).toEqual([]);
  expect((await get(app, "/api/checkin")).body.weeks).toEqual([]);
  expect((await status(app)).head).toBeNull();
  expect(fs.readdirSync(path.join(dataDir, "packs"))).toEqual([]);
  expect(fs.readdirSync(path.join(dataDir, "materials"))).toEqual([]);
  // the M1b seed is still there
  expect(
    (await get(app, "/api/calendar/days?from=2026-11-20&to=2026-11-20")).body,
  ).toHaveLength(1);
  const unknown = await app.request("/api/test/reset", {
    method: "POST",
    headers: { "x-planner-test": "1", "content-type": "application/json" },
    body: JSON.stringify({ state: "m9" }),
  });
  expect(unknown.status).toBe(422);
});

test("the pack hash is async and the lock route awaits it", async () => {
  const { app } = await planner("m2-draft-pack");
  const packs = (await get(app, `/api/packs/${COURSE}`)).body;
  expect(packs.locked).toBeNull();
  expect(packs.draft.courseId).toBe(COURSE);
  const refused = await send(app, "POST", `/api/packs/${COURSE}/lock`);
  expect(refused.status).toBe(422);
  expect(refused.body.error.issues).toEqual([
    "Spec point 1.5 (Invented point 5) is linked to no chapter.",
  ]);
  const fixed = { ...syntheticPack(), courseId: COURSE };
  expect(
    (await send(app, "PUT", `/api/packs/${COURSE}/draft`, fixed)).status,
  ).toBe(200);
  const locked = await send(app, "POST", `/api/packs/${COURSE}/lock`);
  expect(locked.status).toBe(200);
  expect(locked.body.hash).toBe(await packHash(fixed));
  expect(locked.body.lockedAt).toBe("2026-11-24T10:00:00.000Z");
  expect((await get(app, `/api/packs/${COURSE}`)).body.locked).toEqual(
    locked.body,
  );
  expect(
    (await get(app, "/api/courses")).body.find((c: Json) => c.id === COURSE)
      .pack,
  ).toBe("locked");
});

test("the fit rule is one function: GET /api/scheme totals equal fitFor on GET /api/plans/{courseId}/inputs", async () => {
  const { app } = await planner("m2-planned");
  const same = async () => {
    const inputs = (await get(app, `/api/plans/${COURSE}/inputs`))
      .body as PlanInputs;
    const scheme = (await get(app, `/api/scheme/${COURSE}`)).body;
    const fits = fitFor(inputs);
    expect(fits.map((f) => f.groupId)).toEqual(GROUPS);
    for (const f of fits) {
      expect(scheme.totals[f.groupId]).toEqual({
        lessonsLeft: f.lessonsLeft,
        fits: f.fits,
        over: f.over,
      });
      expect(scheme.slotsLeft[f.groupId]).toBe(f.slotsLeft);
    }
    return fits;
  };
  expect((await same()).every((f) => f.fits)).toBe(true);
  const scheme = (await get(app, `/api/scheme/${COURSE}`)).body;
  await send(app, "PUT", `/api/scheme/${COURSE}`, {
    items: scheme.items.map((i: Json) =>
      i.id === "ch4" ? { ...i, lessons: 200 } : i,
    ),
    overrides: [],
  });
  expect((await same()).every((f) => f.over > 0)).toBe(true);
});

test("a proposal on a course with no positions says positions are needed", async () => {
  // 422, not an empty plan
  const { app } = await planner("m2-no-positions");
  const res = await send(app, "POST", `/api/plans/${COURSE}/proposals`);
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe("positions-needed");
  expect(res.body.error.message).toBe(
    "Say where each group is in the scheme before planning: 13 1, 13 3, 13 5.",
  );
});

test("a scheme with a negative or repeated group count, an unknown item or a part-minute length is refused with reasons", async () => {
  const { app } = await planner("m2-no-positions");
  const items = syntheticScheme(COURSE);
  const put = (body: unknown) =>
    send(app, "PUT", `/api/scheme/${COURSE}`, body);
  const refused = await put({
    items,
    overrides: [
      { groupId: "13 1", itemId: "ch2", lessons: -1 },
      { groupId: "13 3", itemId: "ch2", lessons: 5 },
      { groupId: "13 3", itemId: "ch2", lessons: 6 },
      { groupId: "13 5", itemId: "ch9", lessons: 2 },
      { groupId: "11D", itemId: "ch1", lessons: 2 },
    ],
  });
  expect(refused.status).toBe(422);
  expect(refused.body.error.code).toBe("invalid-scheme");
  expect(refused.body.error.issues).toEqual([
    '13 1 has a negative number of lessons for "ch2" (-1).',
    '13 3 has two counts for "ch2".',
    '13 5 has a count for "ch9", and there is no such item.',
    "11D is not a group of this course.",
  ]);
  const halfMinute = items.map((i) =>
    i.assessment
      ? { ...i, assessment: { ...i.assessment, durationMinutes: 22.5 } }
      : i,
  );
  const fraction = await put({ items: halfMinute, overrides: [] });
  expect(fraction.status).toBe(422);
  expect(fraction.body.error.message).toMatch(/durationMinutes/);
  expect((await get(app, `/api/scheme/${COURSE}`)).body.items).toEqual(items);
  expect(
    (
      await put({
        items,
        overrides: [{ groupId: "13 3", itemId: "ch2", lessons: 5 }],
      })
    ).status,
  ).toBe(200);
  expect((await get(app, `/api/scheme/${COURSE}`)).body.overrides).toEqual([
    { groupId: "13 3", itemId: "ch2", lessons: 5 },
  ]);
});

test("every course-scoped route answers 404 for a course that does not exist", async () => {
  const { app } = await planner("m2-planned");
  const calls: [string, string, unknown?][] = [
    ["PUT", "/api/courses/nope", { revisionWeeks: 1 }],
    ["GET", "/api/packs/nope"],
    ["PUT", "/api/packs/nope/draft", { ...syntheticPack(), courseId: "nope" }],
    ["POST", "/api/packs/nope/lock"],
    ["GET", "/api/scheme/nope"],
    ["PUT", "/api/scheme/nope", { items: [], overrides: [] }],
    ["GET", "/api/positions/nope"],
    ["PUT", "/api/positions/nope", { positions: [] }],
    ["GET", "/api/plans/nope"],
    ["GET", "/api/plans/nope/inputs"],
    ["POST", "/api/plans/nope/proposals"],
    [
      "POST",
      "/api/plans/nope/accept",
      { baseRevisionId: "r:any", candidateKey: "k" },
    ],
    [
      "POST",
      "/api/plans/nope/accept",
      { baseRevisionId: null, candidateKey: "k" },
    ],
    ["POST", "/api/plans/nope/undo"],
  ];
  const answers: string[] = [];
  for (const [method, url, body] of calls) {
    const res = await send(app, method, url, body);
    answers.push(`${method} ${url} ${res.status} ${res.body.error?.code}`);
  }
  expect(answers).toEqual(
    calls.map(([method, url]) => `${method} ${url} 404 not-found`),
  );
});

test("a pack file that cannot be read is reported in a sentence, not as a server error", async () => {
  const { app, dataDir } = await planner("m2-planned");
  fs.writeFileSync(
    path.join(dataDir, "packs", `${COURSE}.draft.json`),
    "{ not json",
  );
  const packs = await get(app, `/api/packs/${COURSE}`);
  expect(packs.status).toBe(422);
  expect(packs.body.error).toEqual({
    code: "pack-unreadable",
    message: `The pack file could not be read: ${COURSE}.draft.json is not JSON.`,
  });
  fs.writeFileSync(
    path.join(dataDir, "packs", `${COURSE}.draft.json`),
    JSON.stringify({ ...syntheticPack(), courseId: COURSE, units: "none" }),
  );
  const notAPack = await get(app, `/api/packs/${COURSE}`);
  expect(notAPack.status).toBe(422);
  expect(notAPack.body.error.message).toBe(
    `The pack file could not be read: ${COURSE}.draft.json, units: Invalid input: expected array, received string.`,
  );
});
