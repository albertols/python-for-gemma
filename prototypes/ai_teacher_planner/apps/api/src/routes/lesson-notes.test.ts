import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiProvider } from "@planner/ai";
import { TEACHER_PRINCIPAL } from "@planner/domain";
import { afterAll, expect, test } from "vitest";
import type { ResourceGateway } from "../gateway/resource-gateway.ts";
import { CT, GOOD, ooxml, pdf, png, text } from "../materials/test-files.ts";
import { buildTestApp, syntheticGateway } from "../test-support.ts";
import { attachmentHeader } from "./lesson-notes.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
type App = Awaited<ReturnType<typeof buildTestApp>>;

const COURSE = "ial-business-u4";
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** A planner on its own temporary data folder, reset to a seeded state. */
async function planner(
  state: string | null = "m2-planned",
  extra: {
    gateway?: ResourceGateway;
    ai?: AiProvider | null;
    principal?: Parameters<typeof buildTestApp>[3];
  } = {},
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-notes-"));
  dirs.push(dataDir);
  const app = await buildTestApp(
    { fixedToday: "2026-11-20", dataDir, testRoutes: true },
    extra.gateway,
    undefined,
    extra.principal ?? TEACHER_PRINCIPAL,
    extra.ai ?? null,
  );
  if (state !== null) {
    const res = await app.request("/api/test/reset", {
      method: "POST",
      headers: { "x-planner-test": "1", "content-type": "application/json" },
      body: JSON.stringify({ state }),
    });
    expect(res.status).toBe(200);
  }
  return { app, materials: path.join(dataDir, "materials") };
}

const q = (groupId: string, lessonId: string) =>
  `groupId=${encodeURIComponent(groupId)}&lessonId=${encodeURIComponent(lessonId)}`;
const json = async (res: Response) => ({
  status: res.status,
  headers: res.headers,
  body: (await res.json()) as Json,
});
const getNote = async (app: App, g: string, l: string) =>
  json(await app.request(`/api/lesson-notes?${q(g, l)}`));
const putNote = async (app: App, g: string, l: string, body: unknown) =>
  json(
    await app.request(`/api/lesson-notes?${q(g, l)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const attach = async (
  app: App,
  g: string,
  l: string,
  name: string,
  bytes: Uint8Array,
  headers: Record<string, string> = { "x-planner-upload": "1" },
) => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), name);
  return json(
    await app.request(`/api/lesson-notes/materials?${q(g, l)}`, {
      method: "POST",
      headers,
      body: form,
    }),
  );
};
const listDir = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir) : [];
const get = async (app: App, url: string) => json(await app.request(url));
const del = async (app: App, url: string) =>
  json(await app.request(url, { method: "DELETE" }));

/** The content lessons the plan puts on each date for a group (a re-plan moves them). */
async function planOf(app: App, group: string) {
  const { body } = await get(
    app,
    "/api/placements?from=2026-11-01&to=2027-07-31",
  );
  return (body.placements as Json[])
    .filter((p) => p.groupId === group && !p.lessonId.startsWith("flex:"))
    .map((p) => ({ lessonId: p.lessonId as string, date: p.date as string }));
}

test("a note round-trips for 13 1 and ch26#2, with the # sent encoded in the query", async () => {
  const { app } = await planner(null);
  const put = await putNote(app, "13 1", "ch26#2", {
    text: "Bring the case study",
  });
  expect(put.status).toBe(200);
  expect(put.body).toMatchObject({
    groupId: "13 1",
    lessonId: "ch26#2",
    text: "Bring the case study",
    materials: [],
  });
  // the raw URL has %20 and %23, and the route reads them back as a space and a #
  const url = "/api/lesson-notes?groupId=13%201&lessonId=ch26%232";
  expect((await get(app, url)).body.text).toBe("Bring the case study");
  // another group, another lesson, and a lesson id that merely starts the same are separate
  for (const [g, l] of [
    ["13 3", "ch26#2"],
    ["13 1", "ch26#3"],
    ["13 1", "ch26#20"],
    ["13 1", "ch2#6"],
  ] as const)
    expect((await getNote(app, g, l)).body.text, `${g} ${l}`).toBe("");
});

test("a note is plain text of at most 2,000 characters, kept as typed, and emptying it removes it", async () => {
  const { app } = await planner(null);
  const html = "<b>Photos</b> & <script>alert(1)</script>";
  expect((await putNote(app, "13 1", "ch1#1", { text: html })).body.text).toBe(
    html,
  );
  expect((await getNote(app, "13 1", "ch1#1")).body.text).toBe(html);
  const full = "x".repeat(2000);
  expect((await putNote(app, "13 1", "ch1#2", { text: full })).status).toBe(
    200,
  );
  const tooLong = await putNote(app, "13 1", "ch1#3", { text: `${full}x` });
  expect(tooLong.status).toBe(422);
  expect((await getNote(app, "13 1", "ch1#3")).body.text).toBe("");
  // clearing it (or only spaces) leaves nothing stored
  expect(
    (await putNote(app, "13 1", "ch1#1", { text: "  \n " })).body.text,
  ).toBe("");
  const listed = await get(app, "/api/lesson-notes/summary");
  expect(listed.body.items.map((i: Json) => i.lessonId)).toEqual(["ch1#2"]);
  expect((await putNote(app, "13 1", "ch1#1", {})).status).toBe(422);
});

test("a spare lesson has no notes and every route refuses its id", async () => {
  const { app, materials } = await planner();
  const spare = "flex:13 1:cp:a1#1";
  for (const r of [
    await getNote(app, "13 1", spare),
    await putNote(app, "13 1", spare, { text: "x" }),
    await attach(app, "13 1", spare, "a.pdf", pdf()),
  ]) {
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("spare-lesson");
  }
  // an id with no lesson number is not a lesson either
  expect((await putNote(app, "13 1", "ch1", { text: "x" })).status).toBe(422);
  expect((await putNote(app, "13 1", "", { text: "x" })).status).toBe(422);
  expect((await get(app, "/api/lesson-notes/summary")).body.items).toEqual([]);
  expect(listDir(materials)).toEqual([]);
});

test("a group that does not exist is refused", async () => {
  const { app } = await planner(null);
  expect((await putNote(app, "99 9", "ch1#1", { text: "x" })).status).toBe(404);
  expect((await attach(app, "99 9", "ch1#1", "a.pdf", pdf())).status).toBe(404);
});

test("a note follows its lesson after a re-sequence, when the lesson moves to another day", async () => {
  const { app } = await planner();
  const before = await planOf(app, "13 1");
  const target = before.find((p) => p.lessonId === "ch3#4");
  expect(target, "13 1 has ch3#4 in the plan").toBeDefined();
  await putNote(app, "13 1", "ch3#4", { text: "Use the pricing worksheet" });
  await attach(app, "13 1", "ch3#4", "worksheet.pdf", pdf());

  // two more lessons for ch1 push everything after it later
  const scheme = (await get(app, `/api/scheme/${COURSE}`)).body;
  const items = scheme.items.map((i: Json) =>
    i.id === "ch1" ? { ...i, lessons: i.lessons + 2 } : i,
  );
  expect(
    (
      await json(
        await app.request(`/api/scheme/${COURSE}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items, overrides: [] }),
        }),
      )
    ).status,
  ).toBe(200);
  const proposal = (
    await json(
      await app.request(`/api/plans/${COURSE}/proposals`, { method: "POST" }),
    )
  ).body;
  const accepted = await app.request(`/api/plans/${COURSE}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseRevisionId: proposal.baseRevisionId,
      candidateKey: proposal.candidateKey,
    }),
  });
  expect(accepted.status).toBe(200);

  const after = (await planOf(app, "13 1")).find((p) => p.lessonId === "ch3#4");
  expect(after, "ch3#4 is still in the plan").toBeDefined();
  expect(after?.date).not.toBe(target?.date); // it moved
  const note = await getNote(app, "13 1", "ch3#4");
  expect(note.body.text).toBe("Use the pricing worksheet");
  expect(note.body.materials.map((m: Json) => m.name)).toEqual([
    "worksheet.pdf",
  ]);
  // it is still in the plan, so it is not under the removed heading
  expect((await get(app, "/api/lesson-notes/removed")).body.items).toEqual([]);
});

test("a note for a lesson no longer in the plan is kept and listed as such, with its title", async () => {
  const { app } = await planner();
  await putNote(app, "13 1", "ch3#4", { text: "Case study on pricing" });
  await attach(app, "13 1", "ch3#4", "case.pdf", pdf());
  expect((await get(app, "/api/lesson-notes/removed")).body.items).toEqual([]);

  // ch3 goes from four lessons to two: ch3#4 leaves the plan once the new plan is accepted
  const scheme = (await get(app, `/api/scheme/${COURSE}`)).body;
  await app.request(`/api/scheme/${COURSE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: scheme.items.map((i: Json) =>
        i.id === "ch3" ? { ...i, lessons: 2 } : i,
      ),
      overrides: [],
    }),
  });
  const proposal = (
    await json(
      await app.request(`/api/plans/${COURSE}/proposals`, { method: "POST" }),
    )
  ).body;
  await app.request(`/api/plans/${COURSE}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseRevisionId: proposal.baseRevisionId,
      candidateKey: proposal.candidateKey,
    }),
  });

  const removed = (await get(app, "/api/lesson-notes/removed")).body.items;
  expect(removed).toHaveLength(1);
  expect(removed[0]).toMatchObject({
    groupId: "13 1",
    lessonId: "ch3#4",
    title: "Markets, lesson 4 of 4",
    text: "Case study on pricing",
  });
  expect(removed[0].materials.map((m: Json) => m.name)).toEqual(["case.pdf"]);
  // still readable, editable and downloadable
  expect((await getNote(app, "13 1", "ch3#4")).body.text).toBe(
    "Case study on pricing",
  );
  expect(
    (await putNote(app, "13 1", "ch3#4", { text: "Keep for next year" }))
      .status,
  ).toBe(200);
  const file = removed[0].materials[0];
  expect((await app.request(`/api/materials/${file.id}`)).status).toBe(200);
});

test("an attached file is stored as <uuid>.<ext>, listed with its original name, served as an attachment, and removable", async () => {
  const { app, materials } = await planner();
  const name = "Unit 4 (starter); Léa’s – 経済.pdf";
  const bytes = pdf();
  const up = await attach(app, "13 1", "ch3#2", name, bytes);
  expect(up.status).toBe(201);
  const m = up.body;
  expect(m).toMatchObject({
    name,
    contentType: "application/pdf",
    size: bytes.length,
  });
  expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
  // on disk: one file, named by uuid, with no trace of her name
  const onDisk = listDir(materials);
  expect(onDisk).toEqual([`${m.id}.pdf`]);
  expect(fs.readFileSync(path.join(materials, onDisk[0] as string))).toEqual(
    Buffer.from(bytes),
  );
  expect((await getNote(app, "13 1", "ch3#2")).body.materials).toEqual([m]);
  const summary = (await get(app, "/api/lesson-notes/summary")).body.items;
  expect(summary).toEqual([
    { groupId: "13 1", lessonId: "ch3#2", hasNote: false, materials: 1 },
  ]);

  const res = await app.request(`/api/materials/${m.id}`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  const disposition = res.headers.get("content-disposition") ?? "";
  expect(disposition.startsWith("attachment;")).toBe(true);
  expect(disposition).not.toMatch(/[\r\n]/);
  expect(disposition).toContain(
    `filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
  );
  expect(res.headers.get("content-security-policy")).toContain("sandbox");
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);

  expect((await del(app, `/api/materials/${m.id}`)).status).toBe(200);
  expect(listDir(materials)).toEqual([]);
  expect((await app.request(`/api/materials/${m.id}`)).status).toBe(404);
  expect((await getNote(app, "13 1", "ch3#2")).body.materials).toEqual([]);
  expect((await get(app, "/api/lesson-notes/summary")).body.items).toEqual([]);
  expect((await del(app, `/api/materials/${m.id}`)).status).toBe(404);
});

test("every accepted type can be attached and comes back with its own content type", async () => {
  const { app } = await planner();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  for (const [ext, make] of Object.entries(GOOD)) {
    const up = await attach(app, "13 3", "ch1#1", `file.${ext}`, make());
    expect(up.status, ext).toBe(201);
    const res = await app.request(`/api/materials/${up.body.id}`);
    expect(res.headers.get("content-type"), ext).toBe(types[ext]);
  }
  expect((await getNote(app, "13 3", "ch1#1")).body.materials).toHaveLength(6);
});

test("a type that is not accepted, a lie about the type, a ../ name and an odd name are each refused and leave nothing behind", async () => {
  const { app, materials } = await planner();
  const refused: [string, Uint8Array, number, string][] = [
    [
      "logo.svg",
      text("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      422,
      "material-type",
    ],
    ["page.html", text("<html></html>"), 422, "material-type"],
    ["m.docm", ooxml(CT.docx), 422, "material-type"],
    ["m.xlsm", ooxml(CT.xlsm), 422, "material-type"],
    ["m.pptm", ooxml(CT.pptx), 422, "material-type"],
    ["notpdf.pdf", png(), 422, "material-content"],
    ["macro.xlsx", ooxml(CT.xlsm), 422, "material-content"],
    ["../evil.pdf", pdf(), 422, "material-name"],
    ["..\\evil.pdf", pdf(), 422, "material-name"],
    ["/etc/passwd.pdf", pdf(), 422, "material-name"],
    ["a‮txt.pdf", pdf(), 422, "material-name"],
  ];
  for (const [name, bytes, status, code] of refused) {
    const r = await attach(app, "13 1", "ch3#2", name, bytes);
    expect([name, r.status, r.body.error?.code]).toEqual([name, status, code]);
  }
  expect(listDir(materials)).toEqual([]);
  expect(fs.existsSync(path.join(path.dirname(materials), "evil.pdf"))).toBe(
    false,
  );
  expect((await getNote(app, "13 1", "ch3#2")).body.materials).toEqual([]);
});

test("a body over 25 MB is refused while it streams in, and nothing is left on disk", async () => {
  const { app, materials } = await planner();
  const boundary = "----plannertest";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n`,
  );
  const chunk = Buffer.alloc(64 * 1024);
  let produced = head.length;
  let sentHead = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sentHead) {
        sentHead = true;
        controller.enqueue(head);
        return;
      }
      produced += chunk.length;
      // 300 MB on offer; a route that buffered the body would pull all of it
      if (produced > 300 * 1024 * 1024) controller.close();
      else controller.enqueue(chunk);
    },
  });
  const res = await app.request(
    `/api/lesson-notes/materials?${q("13 1", "ch3#2")}`,
    {
      method: "POST",
      headers: {
        "x-planner-upload": "1",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      duplex: "half",
    },
  );
  const out = await json(res);
  expect(out.status).toBe(413);
  expect(out.body.error.code).toBe("material-too-large");
  expect(out.body.error.message).toMatch(/25 MB/);
  expect(produced).toBeLessThan(25 * 1024 * 1024 + 16 * 1024 * 1024);
  expect(listDir(materials)).toEqual([]);
});

test("an upload that is not a multipart form with one file is refused", async () => {
  const { app, materials } = await planner();
  const url = `/api/lesson-notes/materials?${q("13 1", "ch3#2")}`;
  const headers = { "x-planner-upload": "1" };
  const notForm = await app.request(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: "{}",
  });
  expect(notForm.status).toBe(422);
  const noFile = await app.request(url, {
    method: "POST",
    headers,
    body: (() => {
      const f = new FormData();
      f.append("note", "hello");
      return f;
    })(),
  });
  expect(noFile.status).toBe(422);
  const two = new FormData();
  two.append("file", new Blob([new Uint8Array(pdf())]), "a.pdf");
  two.append("file", new Blob([new Uint8Array(pdf())]), "b.pdf");
  const twoRes = await app.request(url, { method: "POST", headers, body: two });
  expect(twoRes.status).toBe(422);
  expect(listDir(materials)).toEqual([]);
});

test("an upload without the planner's own header is refused, so another web page cannot post a file", async () => {
  const { app, materials } = await planner();
  const r = await attach(app, "13 1", "ch3#2", "a.pdf", pdf(), {});
  expect(r.status).toBe(403);
  expect(listDir(materials)).toEqual([]);
});

test("a role that may only view cannot write a note, attach a file or remove one", async () => {
  const teacher = await planner();
  const up = await attach(teacher.app, "13 1", "ch3#2", "a.pdf", pdf());
  const viewer = await planner(null, { principal: { role: "student" } });
  expect(
    (await putNote(viewer.app, "13 1", "ch3#2", { text: "x" })).status,
  ).toBe(403);
  expect(
    (await attach(viewer.app, "13 1", "ch3#2", "a.pdf", pdf())).status,
  ).toBe(403);
  expect((await del(viewer.app, `/api/materials/${up.body.id}`)).status).toBe(
    403,
  );
  expect(listDir(viewer.materials)).toEqual([]);
});

test("a stored file that is gone from the disk says so instead of failing", async () => {
  const { app, materials } = await planner();
  const up = await attach(app, "13 1", "ch3#2", "a.pdf", pdf());
  fs.rmSync(path.join(materials, `${up.body.id}.pdf`));
  const res = await get(app, `/api/materials/${up.body.id}`);
  expect(res.status).toBe(404);
  expect(res.body.error.message).toMatch(/no longer on this computer/);
  // she can still remove the entry
  expect((await del(app, `/api/materials/${up.body.id}`)).status).toBe(200);
  expect((await getNote(app, "13 1", "ch3#2")).body.materials).toEqual([]);
});

test("a material id that is not one of ours reaches no file", async () => {
  const { app, materials } = await planner();
  fs.mkdirSync(materials, { recursive: true });
  fs.writeFileSync(path.join(path.dirname(materials), "secret.txt"), "keep");
  for (const id of ["..%2Fsecret.txt", "..", "%2Fetc%2Fpasswd", "secret.txt"]) {
    expect((await app.request(`/api/materials/${id}`)).status, id).toBe(404);
    expect((await del(app, `/api/materials/${id}`)).status, id).toBe(404);
  }
  expect(
    fs.readFileSync(path.join(path.dirname(materials), "secret.txt"), "utf8"),
  ).toBe("keep");
});

test("notes and materials never reach a model or the resource gateway", async () => {
  const gateway = await syntheticGateway();
  const calls: string[] = [];
  const spyGateway = new Proxy(gateway, {
    get: (target, prop, receiver) => {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function"
        ? (...args: unknown[]) => {
            calls.push(`gateway.${String(prop)}`);
            return value.apply(target, args);
          }
        : value;
    },
  });
  const spyAi = new Proxy(
    {},
    {
      get:
        (_t, prop) =>
        (..._args: unknown[]) => {
          calls.push(`ai.${String(prop)}`);
          return Promise.reject(new Error("the AI must not be called"));
        },
    },
  ) as AiProvider;
  const { app } = await planner("m2-planned", {
    gateway: spyGateway,
    ai: spyAi,
  });
  await new Promise((r) => setTimeout(r, 20)); // start-up checks settle
  calls.length = 0;

  await putNote(app, "13 1", "ch3#2", { text: "Notes" });
  const up = await attach(app, "13 1", "ch3#2", "a.pdf", pdf());
  await attach(app, "13 1", "ch3#2", "b.png", png());
  await getNote(app, "13 1", "ch3#2");
  await get(app, "/api/lesson-notes/summary");
  await get(app, "/api/lesson-notes/removed");
  await app.request(`/api/materials/${up.body.id}`);
  await del(app, `/api/materials/${up.body.id}`);
  expect(calls).toEqual([]);
});

test("the code that handles notes and materials does not import the AI or the gateway", () => {
  const here = import.meta.dirname;
  const files = [
    path.join(here, "lesson-notes.ts"),
    path.join(here, "..", "usecases", "lesson-notes.ts"),
    path.join(here, "..", "materials", "store.ts"),
    path.join(here, "..", "materials", "upload.ts"),
    path.join(here, "..", "repos", "sqlite", "lesson-note-repo.ts"),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    expect(source, file).not.toMatch(
      /@planner\/ai|resource-gateway|ResourceGateway|ai-provider/,
    );
  }
});

test("the download header cannot be broken out of by a quote, a semicolon or a non-Latin name", () => {
  const header = attachmentHeader('a"; filename="evil.exe\\.pdf');
  expect(
    header.startsWith('attachment; filename="a_; filename=_evil.exe_.pdf"'),
  ).toBe(true);
  expect(header).toContain(
    "filename*=UTF-8''a%22%3B%20filename%3D%22evil.exe%5C.pdf",
  );
  expect(attachmentHeader("経済.pdf")).toBe(
    "attachment; filename=\"__.pdf\"; filename*=UTF-8''%E7%B5%8C%E6%B8%88.pdf",
  );
});
