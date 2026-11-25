import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeAiProvider } from "@planner/ai/fake";
import { FAKE_AI_OUTPUTS } from "@planner/fixtures";
import { afterAll, expect, test } from "vitest";
import { buildTestApp } from "../test-support.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("synthetic picture, not a real timetable"),
]);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function planner(
  over: {
    ai?: "fake" | "off";
    role?: "teacher" | "student";
    output?: unknown;
    delayMs?: number;
    /** Runs on the data folder before the app starts. */
    before?: (dataDir: string) => void;
  } = {},
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-image-"));
  dirs.push(dataDir);
  over.before?.(dataDir);
  const fake = new FakeAiProvider(
    {
      ...FAKE_AI_OUTPUTS,
      ...("output" in over ? { "planner-import-timetable": over.output } : {}),
    },
    over.delayMs ? { delayMs: over.delayMs } : {},
  );
  const app = await buildTestApp(
    { fixedToday: "2026-11-20", dataDir, ai: over.ai ?? "fake" },
    undefined,
    undefined,
    { role: over.role ?? "teacher" },
    fake,
  );
  return { app, fake, dataDir, uploads: path.join(dataDir, "uploads") };
}

const upload = (
  app: App,
  bytes: Uint8Array,
  name = "my-timetable.png",
  headers: Record<string, string> = { "x-planner-upload": "1" },
  versionId = "2026-27",
) => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), name);
  return app.request(
    `/api/timetable/image?versionId=${encodeURIComponent(versionId)}`,
    { method: "POST", headers, body: form },
  );
};
const get = async (app: App, url: string) =>
  (await (await app.request(url)).json()) as Json;
const listDir = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir) : [];
async function finished(app: App, id: string): Promise<Json> {
  for (let i = 0; i < 500; i++) {
    const run = await get(app, `/api/ai/jobs/${id}`);
    if (run.status !== "queued" && run.status !== "running") return run;
    await tick();
  }
  throw new Error("the job never finished");
}
const review = (app: App, id: string, state: string) =>
  app.request(`/api/ai/items/${id}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });

/** The current grid, with changes applied by `edit`. */
async function gridWith(
  app: App,
  edit: (g: { entries: Json[]; duties: Json[] }) => void,
) {
  const { versions } = await get(app, "/api/timetable");
  const grid = {
    entries: structuredClone(versions[0].entries) as Json[],
    duties: structuredClone(versions[0].duties) as Json[],
  };
  edit(grid);
  return { ...grid, unsure: [] };
}

test("an upload is saved under data/uploads and nowhere else, and the job is given that file", async () => {
  // the fake takes its time, so the picture can be looked at while the job still holds it
  const { app, fake, dataDir, uploads } = await planner({ delayMs: 200 });
  const res = await upload(app, PNG, "Timetable (my copy).PNG");
  expect(res.status).toBe(202);
  const run = (await res.json()) as Json;
  expect(run.skillId).toBe("planner-import-timetable");

  const stored = listDir(uploads);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatch(/^[0-9a-f-]{36}\.png$/);
  expect(fs.readFileSync(path.join(uploads, stored[0] as string))).toEqual(PNG);
  // her file name is never used on disk, and nothing else was written under the data folder
  expect(listDir(dataDir).filter((n) => n !== "uploads")).toEqual([]);
  const task = fake.calls.at(-1);
  await finished(app, run.id);
  expect(task?.attachments).toEqual([
    { path: path.join(uploads, stored[0] as string), mediaType: "image/png" },
  ]);
  // the model is told the groups she has, and nothing of the picture's name
  expect(task?.input).toMatchObject({
    versionId: "2026-27",
    knownGroups: expect.arrayContaining(["13 1", "IB H"]),
  });
  expect(JSON.stringify(task?.input)).not.toMatch(/Timetable|my copy/);
});

test("an upload that is not a PNG or JPEG, or is over 5 MB, is refused and nothing is kept or asked", async () => {
  const { app, fake, uploads } = await planner();
  const pdf = await upload(app, Buffer.from("%PDF-1.4 x"), "t.pdf");
  expect(pdf.status).toBe(422);
  expect(((await pdf.json()) as Json).error.code).toBe("material-type");
  // a document renamed .png: the first bytes say what it is
  const renamed = await upload(app, Buffer.from("%PDF-1.4 x"), "t.png");
  expect(renamed.status).toBe(422);
  expect(((await renamed.json()) as Json).error.code).toBe("material-content");
  const big = await upload(
    app,
    Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]),
  );
  expect(big.status).toBe(413);
  expect(((await big.json()) as Json).error.message).toMatch(/5 MB/);
  expect(listDir(uploads)).toEqual([]);
  expect(fake.calls).toEqual([]);
  expect(await get(app, "/api/ai/runs")).toEqual([]);
});

test("without the upload header, as a student, with the AI off, or for a version that is not there, nothing is kept", async () => {
  const noHeader = await planner();
  expect((await upload(noHeader.app, PNG, "t.png", {})).status).toBe(403);
  expect(listDir(noHeader.uploads)).toEqual([]);

  const student = await planner({ role: "student" });
  expect((await upload(student.app, PNG)).status).toBe(403);
  expect(listDir(student.uploads)).toEqual([]);

  const off = await planner({ ai: "off" });
  const res = await upload(off.app, PNG);
  expect(res.status).toBe(409);
  expect(listDir(off.uploads)).toEqual([]);

  const missing = await planner();
  const gone = await upload(missing.app, PNG, "t.png", undefined, "nope");
  expect(gone.status).toBe(404);
  expect(listDir(missing.uploads)).toEqual([]);
});

test("the suggestion is a reviewable item; the timetable does not change until she accepts", async () => {
  const { app } = await planner();
  const before = await get(app, "/api/timetable");
  const run = (await (await upload(app, PNG)).json()) as Json;
  expect((await finished(app, run.id)).status).toBe("done");

  const items = await get(app, "/api/ai/items?review=suggested");
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    kind: "timetable-grid",
    target: "2026-27",
    review: "suggested",
  });
  // the item holds the whole suggested grid: the cell the fake read differently is in it
  const monday = items[0].data.entries.find(
    (e: Json) => e.week === "W1" && e.weekday === 1 && e.period === 1,
  );
  expect(monday).toMatchObject({ groupId: "IB H", room: "607" });
  // asking changed nothing
  expect(await get(app, "/api/timetable")).toEqual(before);

  expect((await review(app, items[0].id, "accepted")).status).toBe(200);
  const after = await get(app, "/api/timetable");
  expect(after.versions[0].entries).toEqual(items[0].data.entries);
  expect(after.versions[0].entries).not.toEqual(before.versions[0].entries);
  // she has to say it only once
  expect((await review(app, items[0].id, "accepted")).status).toBe(409);
});

test("rejecting the suggestion changes nothing", async () => {
  const { app } = await planner();
  const before = await get(app, "/api/timetable");
  const run = (await (await upload(app, PNG)).json()) as Json;
  await finished(app, run.id);
  const [item] = await get(app, "/api/ai/items?review=suggested");
  expect((await review(app, item.id, "rejected")).status).toBe(200);
  expect(await get(app, "/api/timetable")).toEqual(before);
});

test("accepting a grid with two groups in one period is refused with the reason, and the grid stays as it was", async () => {
  const { app: probe } = await planner();
  const clash = await gridWith(probe, (g) =>
    // 13 1 into the cell IB H already has (Week 1 Monday period 1)
    g.entries.push({
      week: "W1",
      weekday: 1,
      period: 1,
      groupId: "13 1",
      room: "101",
    }),
  );
  const { app } = await planner({ output: clash });
  const before = await get(app, "/api/timetable");
  const run = (await (await upload(app, PNG)).json()) as Json;
  expect((await finished(app, run.id)).status).toBe("done");
  const [item] = await get(app, "/api/ai/items?review=suggested");

  const res = await review(app, item.id, "accepted");
  expect(res.status).toBe(422);
  const body = (await res.json()) as Json;
  expect(body.error.code).toBe("invalid-timetable");
  expect(body.error.issues).toEqual([
    "W1 day 1 period 1: 13 1 and IB H share one period.",
  ]);
  expect(await get(app, "/api/timetable")).toEqual(before);
  // the item is still waiting for her
  expect((await get(app, "/api/ai/items?review=suggested")).length).toBe(1);
});

test("a group the planner does not have is refused with the reason", async () => {
  const { app: probe } = await planner();
  // the first lesson is read as a group she does not have
  const ghost = await gridWith(probe, (g) => {
    g.entries[0] = { ...g.entries[0], groupId: "12 Z" };
  });
  const { app } = await planner({ output: ghost });
  const run = (await (await upload(app, PNG)).json()) as Json;
  await finished(app, run.id);
  const [item] = await get(app, "/api/ai/items?review=suggested");
  const res = await review(app, item.id, "accepted");
  expect(res.status).toBe(422);
  expect(((await res.json()) as Json).error.issues[0]).toMatch(
    /12 Z.*does not exist/,
  );
});

test("cells the model was unsure about are listed for her, and are not in the grid", async () => {
  const { app } = await planner();
  const run = (await (await upload(app, PNG)).json()) as Json;
  await finished(app, run.id);
  const [item] = await get(app, "/api/ai/items?review=suggested");
  expect(item.data.unsure).toEqual([
    {
      week: "W1",
      weekday: 2,
      period: 1,
      note: "The code in this cell is smudged.",
    },
  ]);
  expect(
    item.data.entries.some(
      (e: Json) => e.week === "W1" && e.weekday === 2 && e.period === 1,
    ),
  ).toBe(false);
});

test("the skill's output refuses a day or a period that is not on the timetable", async () => {
  const { app: probe } = await planner();
  const bad = await gridWith(probe, (g) =>
    g.entries.push({
      week: "W1",
      weekday: 6,
      period: 7,
      groupId: "13 1",
      room: null,
    }),
  );
  const { app } = await planner({ output: bad });
  const run = (await (await upload(app, PNG)).json()) as Json;
  const done = await finished(app, run.id);
  expect(done.status).toBe("failed");
  expect(await get(app, "/api/ai/items")).toEqual([]);
});

test("the picture is deleted when the job is done, and the item keeps the grid", async () => {
  const { app, uploads } = await planner();
  const run = (await (await upload(app, PNG)).json()) as Json;
  expect((await finished(app, run.id)).status).toBe("done");
  expect(listDir(uploads)).toEqual([]);
  const [item] = await get(app, "/api/ai/items?review=suggested");
  expect(item.data.entries.length).toBeGreaterThan(0);
});

test("the picture is deleted when the job fails", async () => {
  const { app, uploads } = await planner({ output: { nonsense: true } });
  const run = (await (await upload(app, PNG)).json()) as Json;
  expect((await finished(app, run.id)).status).toBe("failed");
  expect(listDir(uploads)).toEqual([]);
});

test("the picture is deleted when the job is cancelled while running, and while it waits", async () => {
  const { app, uploads } = await planner({ delayMs: 300 });
  const first = (await (await upload(app, PNG)).json()) as Json;
  // a second job waits behind the first
  const second = (await (await upload(app, PNG)).json()) as Json;
  expect(listDir(uploads)).toHaveLength(2);
  const cancel = (id: string) =>
    app.request(`/api/ai/jobs/${id}/cancel`, { method: "POST" });
  expect((await cancel(second.id)).status).toBe(200);
  expect((await cancel(first.id)).status).toBe(200);
  expect((await finished(app, first.id)).status).toBe("cancelled");
  expect((await finished(app, second.id)).status).toBe("cancelled");
  for (let i = 0; i < 200 && listDir(uploads).length > 0; i++) await tick();
  expect(listDir(uploads)).toEqual([]);
});

test("at start-up, pictures older than 24 hours are deleted and newer ones are kept", async () => {
  const name = (n: number) => `0b6f1e0e-0000-4000-8000-00000000000${n}.png`;
  const { uploads } = await planner({
    before(dataDir) {
      const dir = path.join(dataDir, "uploads");
      fs.mkdirSync(dir);
      for (const n of [1, 2]) fs.writeFileSync(path.join(dir, name(n)), PNG);
      // the test app's clock is 2026-11-24T10:00Z
      const old = new Date("2026-11-22T10:00:00Z");
      fs.utimesSync(path.join(dir, name(1)), old, old);
      const recent = new Date("2026-11-24T08:00:00Z");
      fs.utimesSync(path.join(dir, name(2)), recent, recent);
    },
  });
  expect(listDir(uploads)).toEqual([name(2)]);
});

test("a cell the model listed as unsure is always empty, even if it also filled it in", async () => {
  const { app: probe } = await planner();
  const both = await gridWith(probe, (g) => {
    g.entries.push({
      week: "W2",
      weekday: 3,
      period: 1,
      groupId: "13 1",
      room: null,
    });
    g.duties.push({ week: "W2", weekday: 3, period: 2, label: "Gate" });
  });
  both.unsure = [
    { week: "W2", weekday: 3, period: 1, note: "unclear" },
    { week: "W2", weekday: 3, period: 2, note: "unclear" },
  ] as never;
  const { app } = await planner({ output: both });
  const run = (await (await upload(app, PNG)).json()) as Json;
  await finished(app, run.id);
  const [item] = await get(app, "/api/ai/items?review=suggested");
  const at = (c: Json) => c.week === "W2" && c.weekday === 3 && c.period <= 2;
  expect(item.data.entries.filter(at)).toEqual([]);
  expect(item.data.duties.filter(at)).toEqual([]);
  expect(item.data.unsure).toHaveLength(2);
});

test("an edited item cannot aim at another timetable version", async () => {
  const { app } = await planner();
  const run = (await (await upload(app, PNG)).json()) as Json;
  await finished(app, run.id);
  const [item] = await get(app, "/api/ai/items?review=suggested");
  const before = await get(app, "/api/timetable");
  const res = await app.request(`/api/ai/items/${item.id}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state: "edited",
      data: { ...item.data, versionId: "somewhere-else" },
    }),
  });
  expect(res.status).toBe(422);
  expect(((await res.json()) as Json).error.code).toBe("wrong-version");
  expect(await get(app, "/api/timetable")).toEqual(before);
});
