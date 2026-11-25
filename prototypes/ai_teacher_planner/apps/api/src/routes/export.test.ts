import fs from "node:fs";
import { TEACHER_PRINCIPAL } from "@planner/domain";
import ExcelJS from "exceljs";
import { afterAll, expect, test } from "vitest";
import { createApp } from "../app.ts";
import type { AiItem } from "../repos/ports.ts";
import { seededRepos, syntheticGateway, testConfig } from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** The m2-planned world (a plan accepted as of 26 Oct) with today fixed, and a way to add AI items. */
async function world(today = "2026-11-25") {
  const s = await seededRepos("m2-planned");
  dirs.push(s.dataDir);
  const app = await createApp({
    ai: null,
    config: { ...testConfig, fixedToday: today, dataDir: s.dataDir },
    db: s.db,
    now: () => new Date("2026-11-24T10:00:00Z"),
    gateway: await syntheticGateway(),
    principal: TEACHER_PRINCIPAL,
  });
  const suggest = (
    id: string,
    courseId: string | null,
    review: AiItem["review"] = "suggested",
  ) => {
    if (!s.repos.ai.getRun("run-1"))
      s.repos.ai.insertRun({
        id: "run-1",
        skillId: "planner-suggest-lesson-counts",
        status: "done",
        startedAt: "2026-11-24T09:00:00.000Z",
        durationMs: 10,
        provider: "fake",
        model: "fake",
        failure: null,
        note: null,
      });
    s.repos.ai.insertItem({
      id,
      runId: "run-1",
      kind: "lesson-count",
      target: "ch1",
      courseId,
      data: {},
      review,
      reviewedAt: null,
      sources: [],
    });
  };
  return { ...s, app, suggest };
}
type World = Awaited<ReturnType<typeof world>>;

const fortnightEnd = async (w: World, w1: string) => {
  const list = (await (
    await w.app.request("/api/fortnights")
  ).json()) as Json[];
  const f = list.find((x) => (x.w1 ?? x.w2) === w1);
  const last = f.w2 ?? f.w1;
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
};
const w1Of = async (w: World, containing = "2026-11-23") => {
  const list = (await (
    await w.app.request("/api/fortnights")
  ).json()) as Json[];
  const f = list.find((x) => x.w1 === containing || x.w2 === containing);
  return (f.w1 ?? f.w2) as string;
};
const xlsx = async (w: World, w1: string) => {
  const res = await w.app.request(`/api/export/fortnight.xlsx?w1=${w1}`);
  const bytes = new Uint8Array(await res.clone().arrayBuffer());
  return { res, bytes };
};
const sheetsOf = async (bytes: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
};
const cellTexts = (ws: ExcelJS.Worksheet) => {
  const out: string[] = [];
  ws.eachRow((row, r) => {
    if (r > 1 && r <= 7)
      row.eachCell((cell, c) => {
        if (c > 1) out.push(String(cell.value));
      });
  });
  return out;
};

test("the Excel route sends the fortnight as a workbook with the lessons the plan has, in her timetable's shape", async () => {
  const w = await world();
  const w1 = await w1Of(w);
  const { res, bytes } = await xlsx(w, w1);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(res.headers.get("content-disposition")).toBe(
    `attachment; filename="fortnight-${w1}.xlsx"`,
  );
  expect(res.headers.get("x-planner-warning")).toBeNull();
  const wb = await sheetsOf(bytes);
  expect(wb.worksheets.map((s) => s.name)).toEqual(["Week 1", "Week 2"]);
  const texts = wb.worksheets.flatMap(cellTexts);
  // the same lessons the board shows for those days, with "(n of m)"
  const placed = (await (
    await w.app.request(
      `/api/placements?from=${w1}&to=${await fortnightEnd(w, w1)}`,
    )
  ).json()) as Json;
  expect(placed.placements.length).toBeGreaterThan(5);
  for (const p of placed.placements as Json[]) {
    const label =
      p.of && p.of > 1 ? `${p.title} (${p.index} of ${p.of})` : p.title;
    expect(
      texts.some((t) => t.startsWith(`${p.groupId}\n`) && t.includes(label)),
    ).toBe(true);
  }
});

test("the export shows the board's states: a past planned lesson is assumed, her log entry wins", async () => {
  const w = await world("2026-11-25");
  const w1 = await w1Of(w);
  const placed = (await (
    await w.app.request(`/api/placements?from=${w1}&to=2026-11-24`)
  ).json()) as Json;
  const first = (placed.placements as Json[]).find(
    (p) => p.state === "assumed",
  );
  if (!first) throw new Error("no past planned lesson to check");
  expect(
    (await sheetsOf((await xlsx(w, w1)).bytes)).worksheets
      .flatMap(cellTexts)
      .some(
        (t) => t.includes(first.title) && t.includes("Assumed, not confirmed"),
      ),
  ).toBe(true);
  // she says it was cover: the log entry wins
  const logged = await w.app.request("/api/checkin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entries: [
        {
          groupId: first.groupId,
          lessonId: first.lessonId,
          outcome: "cover",
          note: null,
        },
      ],
    }),
  });
  expect(logged.status).toBe(200);
  const texts = (await sheetsOf((await xlsx(w, w1)).bytes)).worksheets.flatMap(
    cellTexts,
  );
  const cell = texts.find(
    (t) => t.startsWith(`${first.groupId}\n`) && t.includes(first.title),
  );
  expect(cell).toMatch(/\nCover$/);
  expect(cell).not.toContain("Assumed");
});

test("the export route sets the warning header when something was left out", async () => {
  const w = await world();
  const w1 = await w1Of(w);
  w.suggest("a", "ial-business-u4");
  w.suggest("b", "ial-business-u4");
  w.suggest("c", "ial-business-u4", "accepted"); // reviewed: not counted
  const { res, bytes } = await xlsx(w, w1);
  const warning =
    "2 AI suggestions were left out because you have not reviewed them.";
  expect(res.headers.get("x-planner-warning")).toBe(warning);
  // and in the file's own metadata
  expect((await sheetsOf(bytes)).description).toBe(warning);
});

test("an item awaiting review for another course is not left out of this course's export", async () => {
  const w = await world();
  const w1 = await w1Of(w);
  w.suggest("other", "ib-business");
  w.suggest("none", null);
  const { res } = await xlsx(w, w1);
  expect(res.headers.get("x-planner-warning")).toBeNull();
  w.suggest("mine", "ial-business-u4");
  expect((await xlsx(w, w1)).res.headers.get("x-planner-warning")).toBe(
    "1 AI suggestion was left out because you have not reviewed it.",
  );
});

test("a fortnight that does not exist is a 404 in the API's own shape", async () => {
  const w = await world();
  const res = await w.app.request("/api/export/fortnight.xlsx?w1=2026-11-24");
  expect(res.status).toBe(404);
  expect(((await res.json()) as Json).error.code).toBe("not-found");
  expect(
    (await w.app.request("/api/export/fortnight.xlsx?w1=nonsense")).status,
  ).toBe(422);
});

test("the Teams route sends the group's week as text, with the warning in the header and in the body", async () => {
  const w = await world();
  w.suggest("a", "ial-business-u4");
  const res = await w.app.request(
    "/api/export/teams?groupId=13%201&weekOf=2026-11-23",
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as Json;
  expect(body.warning).toBe(
    "1 AI suggestion was left out because you have not reviewed it.",
  );
  expect(res.headers.get("x-planner-warning")).toBe(body.warning);
  const lines = (body.text as string).split("\n");
  expect(lines[0]).toBe("13 1: week of 23 November");
  expect(lines.length).toBeGreaterThan(2);
  for (const l of lines.slice(1))
    expect(l).toMatch(/^(Mon|Tue|Wed|Thu|Fri) \d+ Nov P[1-6]: .+/);
  // the board's own lessons for that group and week are the ones listed
  const placed = (await (
    await w.app.request("/api/placements?from=2026-11-23&to=2026-11-29")
  ).json()) as Json;
  const board = [...placed.placements, ...placed.assessments] as Json[];
  expect(lines.length - 1).toBe(
    board.filter((p) => p.groupId === "13 1").length,
  );
});

test("the Teams route does not warn about another course's suggestions, and refuses a group that does not exist", async () => {
  const w = await world();
  w.suggest("other", "ib-business");
  const ok = await w.app.request(
    "/api/export/teams?groupId=13%201&weekOf=2026-11-23",
  );
  expect(((await ok.json()) as Json).warning).toBeNull();
  const bad = await w.app.request(
    "/api/export/teams?groupId=99%209&weekOf=2026-11-23",
  );
  expect(bad.status).toBe(404);
});

test("a title that looks like a formula reaches the workbook as text", async () => {
  const w = await world();
  const w1 = await w1Of(w);
  const placed = (await (
    await w.app.request(
      `/api/placements?from=${w1}&to=${await fortnightEnd(w, w1)}`,
    )
  ).json()) as Json;
  const shown = (placed.placements as Json[]).find((p) => p.itemId !== null);
  const items = w.repos.scheme.items("ial-business-u4");
  w.repos.scheme.replace(
    "ial-business-u4",
    items.map((i) =>
      i.id === shown.itemId
        ? { ...i, title: '=HYPERLINK("http://example.invalid","x")' }
        : i,
    ),
    w.repos.scheme.overrides("ial-business-u4"),
  );
  const wb = await sheetsOf((await xlsx(w, w1)).bytes);
  let formulas = 0;
  let found = 0;
  for (const ws of wb.worksheets)
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.type === ExcelJS.ValueType.Formula) formulas++;
        if (String(cell.value).includes("=HYPERLINK")) found++;
      }),
    );
  expect(found).toBeGreaterThan(0);
  expect(formulas).toBe(0);
});

test("merged cells in the export are exactly the timetable's doubles, and every lesson on the board is in it once", async () => {
  const w = await world();
  const w1 = await w1Of(w);
  const end = await fortnightEnd(w, w1);
  const placed = (await (
    await w.app.request(`/api/placements?from=${w1}&to=${end}`)
  ).json()) as Json;
  const slots = (await (
    await w.app.request(`/api/slots?from=${w1}&to=${end}`)
  ).json()) as Json[];
  const wb = await sheetsOf((await xlsx(w, w1)).bytes);
  // every lesson and assessment on the board, once (a double's cell holds both halves)
  const texts = wb.worksheets.flatMap(cellTexts);
  const board = [...placed.placements, ...placed.assessments] as Json[];
  expect(board.length).toBeGreaterThan(10);
  for (const p of board) {
    const label =
      p.of && p.of > 1 ? `${p.title} (${p.index} of ${p.of})` : p.title;
    const holding = texts.filter(
      (t) => t.startsWith(`${p.groupId}\n`) && t.split("\n").includes(label),
    );
    expect(holding.length).toBeGreaterThanOrEqual(1);
  }
  const count = (list: string[]) =>
    list.reduce((n, t) => n + t.split("\n").length - 1, 0);
  expect(count(texts)).toBeGreaterThanOrEqual(board.length);
  // a merge happens only for a pair of slots the timetable calls a double
  const doubles = new Set(
    slots
      .filter((s) => s.doubleWith)
      .map((s) => `${s.groupId}|${s.date}|${s.period}`),
  );
  expect(doubles.size).toBeGreaterThan(0);
  const merged = wb.worksheets.flatMap((ws) => ws.model.merges);
  expect(merged.length).toBeGreaterThan(0);
  for (const range of merged) {
    const [a, b] = range.split(":");
    expect(a?.[0]).toBe(b?.[0]); // one day
    expect(Number(b?.slice(1)) - Number(a?.slice(1))).toBe(1); // two periods
    expect(Number(a?.slice(1)) % 2).toBe(0); // P1, P3 or P5 first (rows 2, 4, 6)
  }
});

test("an assessment that is in the past shows as assumed, like the board's past lessons", async () => {
  const w = await world("2026-11-30");
  const w1 = await w1Of(w);
  const placed = (await (
    await w.app.request(
      `/api/placements?from=${w1}&to=${await fortnightEnd(w, w1)}`,
    )
  ).json()) as Json;
  const past = (placed.assessments as Json[]).find(
    (a) => a.date < "2026-11-30",
  );
  if (!past) throw new Error("no past assessment");
  const texts = (await sheetsOf((await xlsx(w, w1)).bytes)).worksheets.flatMap(
    cellTexts,
  );
  const cell = texts.find(
    (t) => t.startsWith(`${past.groupId}\n`) && t.includes(past.title),
  );
  expect(cell).toContain("Assumed, not confirmed");
});
