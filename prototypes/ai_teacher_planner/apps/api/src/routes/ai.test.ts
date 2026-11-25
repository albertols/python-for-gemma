import { AiError, type AiProvider, type AiTask } from "@planner/ai";
import { FakeAiProvider } from "@planner/ai/fake";
import { TEACHER_PRINCIPAL } from "@planner/domain";
import { FAKE_AI_OUTPUTS } from "@planner/fixtures";
import { afterEach, expect, test } from "vitest";
import { providerFor } from "../ai-provider.ts";
import { createApp } from "../app.ts";
import type { AiItem } from "../repos/ports.ts";
import { fakeGateway, migratedDb, testConfig } from "../test-support.ts";
import {
  getItemHandler,
  type ItemHandler,
  registerItemHandler,
} from "../usecases/ai-jobs.ts";
import { provenanceOf } from "../usecases/review-item.ts";

// biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON
type Json = any;
const SKILL = "planner-suggest-lesson-counts" as const;
const NOW = "2026-11-24T10:00:00.000Z";
const input = {
  courseTitle: "Synthetic Economics",
  mode: "differences",
  items: [
    { id: "ch3", title: "Markets", lessons: 4 },
    { id: "ch4", title: "Firms", lessons: 3 },
  ],
  unitTotals: [{ unitId: "u1", lessons: 20 }],
};
const output = {
  suggestions: [
    {
      itemId: "ch3",
      lessons: 5,
      reason: "Needs worked examples.",
      tricky: false,
    },
    { itemId: "ch4", lessons: 2, reason: "Mostly recap.", tricky: true },
  ],
};
const REQUEST = { skillId: SKILL, input, text: null, attachments: [] };
const SIGNED_OUT =
  "Claude Code is signed out. Run `claude` in a terminal and sign in, then try again.";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Answers like the fake, but each run waits for `release()`; honours cancel unless told not to. */
class GatedProvider implements AiProvider {
  readonly id = "fake";
  readonly inner = new FakeAiProvider({ [SKILL]: output });
  started: string[] = [];
  running = 0;
  maxRunning = 0;
  private gates: (() => void)[] = [];
  private readonly honourCancel: boolean;
  constructor(honourCancel = true) {
    this.honourCancel = honourCancel;
  }
  available() {
    return this.inner.available();
  }
  release() {
    this.gates.shift()?.();
  }
  async run<T>(task: AiTask<T>, opts: Parameters<AiProvider["run"]>[1]) {
    this.started.push(task.skillId);
    this.running++;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    try {
      await new Promise<void>((resolve, reject) => {
        this.gates.push(resolve);
        if (this.honourCancel)
          opts.signal.addEventListener(
            "abort",
            () => {
              this.gates = this.gates.filter((g) => g !== resolve);
              reject(new AiError("cancelled"));
            },
            { once: true },
          );
      });
      return await this.inner.run(task, opts);
    } finally {
      this.running--;
    }
  }
}

function build(
  ai: AiProvider | null,
  over: Partial<typeof testConfig> = {},
  principal: { role: "teacher" | "head-of-department" } = TEACHER_PRINCIPAL,
  db = migratedDb(),
  now: () => Date = () => new Date(NOW),
) {
  return createApp({
    ai,
    config: { ...testConfig, ai: "fake", ...over },
    db,
    now,
    gateway: fakeGateway({}),
    principal,
  });
}
type App = ReturnType<typeof build>;

const call = async (app: App, method: string, url: string, body?: unknown) => {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json", "x-planner-test": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
};
const start = (app: App, over: Record<string, unknown> = {}) =>
  call(app, "POST", "/api/ai/jobs", { ...REQUEST, ...over });
async function finished(app: App, id: string): Promise<Json> {
  for (let i = 0; i < 500; i++) {
    const run = (await call(app, "GET", `/api/ai/jobs/${id}`)).body;
    if (run.status !== "queued" && run.status !== "running") return run;
    await tick();
  }
  throw new Error("the job never finished");
}
const suggested = async (app: App) =>
  (await call(app, "GET", "/api/ai/items?review=suggested")).body as Json[];
const events = async (app: App, id: string) => {
  const text = await (await app.request(`/api/ai/jobs/${id}/events`)).text();
  return {
    text,
    list: text
      .split("\n\n")
      .filter((b) => b.trim() !== "")
      .map((block) => ({
        event: /^event: (.*)$/m.exec(block)?.[1],
        data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null") as Json,
      })),
  };
};

const original = getItemHandler(SKILL);
afterEach(() => {
  if (original) registerItemHandler(SKILL, original);
});

test("jobs run one at a time, in order", async () => {
  const ai = new GatedProvider();
  const app = build(ai);
  const ids = [
    (await start(app)).body.id,
    (await start(app)).body.id,
    (await start(app)).body.id,
  ];
  await tick();
  const statuses = async () =>
    Promise.all(
      ids.map(
        async (id) =>
          (await call(app, "GET", `/api/ai/jobs/${id}`)).body.status,
      ),
    );
  expect(await statuses()).toEqual(["running", "queued", "queued"]);
  expect(ai.started).toHaveLength(1);
  ai.release();
  await finished(app, ids[0]);
  await tick();
  expect(await statuses()).toEqual(["done", "running", "queued"]);
  ai.release();
  await finished(app, ids[1]);
  await tick();
  ai.release();
  await finished(app, ids[2]);
  expect(ai.started).toHaveLength(3);
  expect(ai.maxRunning).toBe(1);
  expect(await statuses()).toEqual(["done", "done", "done"]);
});

test("a finished job stores one run and its items, each suggested", async () => {
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const res = await start(app);
  expect(res.status).toBe(202);
  expect(res.body).toMatchObject({
    skillId: SKILL,
    status: "queued",
    startedAt: NOW,
    itemIds: [],
  });
  const run = await finished(app, res.body.id);
  expect(run).toMatchObject({
    id: res.body.id,
    status: "done",
    provider: "fake",
    model: "fake",
    failure: null,
  });
  expect(typeof run.durationMs).toBe("number");
  expect(run.itemIds).toHaveLength(2);
  const items = await suggested(app);
  expect(items.map((i) => i.id)).toEqual(run.itemIds);
  expect(items[0]).toEqual({
    id: run.itemIds[0],
    runId: run.id,
    kind: "lesson-count",
    target: "ch3",
    courseId: null,
    data: {
      itemId: "ch3",
      title: "Markets",
      from: 4,
      to: 5,
      reason: "Needs worked examples.",
      tricky: false,
    },
    review: "suggested",
    reviewedAt: null,
    sources: [],
  });
  expect(items[1]).toMatchObject({
    target: "ch4",
    data: { from: 3, to: 2, tricky: true },
  });
  expect((await call(app, "GET", "/api/ai/runs")).body).toEqual([run]);
});

test("an item remembers the course its job named", async () => {
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const res = await start(app, { input: { ...input, courseId: "syn-econ" } });
  await finished(app, res.body.id);
  expect((await suggested(app)).map((i) => i.courseId)).toEqual([
    "syn-econ",
    "syn-econ",
  ]);
});

test("runs are listed newest first", async () => {
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const first = (await start(app)).body.id;
  await finished(app, first);
  const second = (await start(app)).body.id;
  await finished(app, second);
  expect(
    (await call(app, "GET", "/api/ai/runs")).body.map((r: Json) => r.id),
  ).toEqual([second, first]);
});

test("a failed job stores the run with its reason and no items", async () => {
  const app = build(
    new FakeAiProvider({ [SKILL]: output }, { fail: "invalid-output" }),
  );
  const res = await start(app);
  const run = await finished(app, res.body.id);
  expect(run).toMatchObject({ status: "failed", itemIds: [] });
  expect(await suggested(app)).toEqual([]);
});

test("a failure reason is a sentence, not an error code", async () => {
  const sentences = {
    unavailable:
      "Claude Code is not installed on this Mac. Everything else still works.",
    "signed-out": SIGNED_OUT,
    timeout: "Claude took too long and was stopped. Nothing was saved.",
    "invalid-output":
      "Claude returned something the planner could not use. Nothing was saved.",
    cancelled: "Cancelled. Nothing was saved.",
    failed: "Claude stopped with an error. Nothing was saved.",
  } as const;
  for (const [reason, sentence] of Object.entries(sentences)) {
    const app = build(
      new FakeAiProvider(
        { [SKILL]: output },
        { fail: reason as keyof typeof sentences },
      ),
    );
    const run = await finished(app, (await start(app)).body.id);
    expect(run.failure).toBe(sentence);
    // a run the provider itself calls cancelled is a failed run, not one she cancelled
    expect(run.status).toBe("failed");
  }
});

test("a provider's own words never reach the browser: not in the run, not in the events", async () => {
  const leaky: AiProvider = {
    id: "leaky",
    available: async () => ({ ok: true }),
    async run(_task, opts) {
      opts.onProgress({ kind: "started" });
      opts.onProgress({
        kind: "failed",
        reason: "cannot open /Users/x/secret.docx",
      });
      throw new AiError("failed", "cannot open /Users/x/secret.docx");
    },
  };
  const app = build(leaky);
  const run = await finished(app, (await start(app)).body.id);
  expect(run.failure).toBe("Claude stopped with an error. Nothing was saved.");
  const { text, list } = await events(app, run.id);
  expect(text).not.toContain("/Users");
  expect(list.at(-2)).toEqual({
    event: "progress",
    data: { kind: "failed", reason: run.failure },
  });
});

test("with AI off, starting a job is refused and the engine routes still answer", async () => {
  const app = build(null, { ai: "off" });
  const res = await start(app);
  expect(res.status).toBe(409);
  expect(res.body.error).toEqual({
    code: "ai-off",
    message: "AI is switched off.",
  });
  expect((await call(app, "GET", "/api/ai/runs")).body).toEqual([]);
  expect(
    (await call(app, "GET", "/api/slots?from=2026-11-24&to=2026-11-24")).status,
  ).toBe(200);
});

class SignedOut extends FakeAiProvider {
  availableCalls = 0;
  override async available() {
    this.availableCalls++;
    return { ok: false as const, reason: SIGNED_OUT };
  }
}

test("with Claude signed out, the config says so and a job is refused with that reason", async () => {
  const ai = new SignedOut({ [SKILL]: output });
  const app = build(ai);
  expect((await call(app, "GET", "/api/config")).body.ai).toEqual({
    mode: "fake",
    available: false,
    reason: SIGNED_OUT,
  });
  const res = await start(app);
  expect(res.status).toBe(409);
  expect(res.body.error).toEqual({
    code: "ai-unavailable",
    message: SIGNED_OUT,
  });
  expect(ai.calls).toEqual([]);
});

test("a job checks that Claude is available before it runs, and fails with the reason when it is not", async () => {
  let asked = 0;
  const flaky = new FakeAiProvider({ [SKILL]: output });
  flaky.available = async () => {
    asked++;
    // the start-up check, the route's check, then the job's own check
    return asked <= 2 ? { ok: true } : { ok: false, reason: SIGNED_OUT };
  };
  const app = build(flaky);
  await tick();
  const res = await start(app);
  expect(res.status).toBe(202);
  const run = await finished(app, res.body.id);
  expect(run).toMatchObject({
    status: "failed",
    failure: SIGNED_OUT,
    itemIds: [],
  });
  expect(flaky.calls).toEqual([]);
  expect(asked).toBe(3);
});

test("config reports the provider's availability, checked at start-up and at most once a minute", async () => {
  let asked = 0;
  const ai = new FakeAiProvider({ [SKILL]: output });
  ai.available = async () => {
    asked++;
    return asked === 1
      ? { ok: true }
      : {
          ok: false,
          reason:
            "Claude Code is not installed on this Mac. Everything else still works.",
        };
  };
  let t = Date.parse(NOW);
  const app = build(ai, {}, TEACHER_PRINCIPAL, migratedDb(), () => new Date(t));
  expect((await call(app, "GET", "/api/config")).body.ai).toEqual({
    mode: "fake",
    available: true,
    reason: null,
  });
  t += 59_000;
  expect((await call(app, "GET", "/api/config")).body.ai.available).toBe(true);
  expect(asked).toBe(1);
  t += 2_000;
  expect((await call(app, "GET", "/api/config")).body.ai).toEqual({
    mode: "fake",
    available: false,
    reason:
      "Claude Code is not installed on this Mac. Everything else still works.",
  });
  expect(asked).toBe(2);
});

test("cancel stops a running job and stores nothing", async () => {
  const ai = new GatedProvider();
  const app = build(ai);
  const id = (await start(app)).body.id;
  await tick();
  const res = await call(app, "POST", `/api/ai/jobs/${id}/cancel`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    status: "cancelled",
    failure: "Cancelled. Nothing was saved.",
    itemIds: [],
  });
  await tick();
  expect(await suggested(app)).toEqual([]);
  expect((await call(app, "GET", `/api/ai/jobs/${id}`)).body.status).toBe(
    "cancelled",
  );
  // the queue is free again
  const next = (await start(app)).body.id;
  await tick();
  ai.release();
  expect((await finished(app, next)).status).toBe("done");
});

test("a provider that ignores cancel still stores nothing", async () => {
  const ai = new GatedProvider(false);
  const app = build(ai);
  const id = (await start(app)).body.id;
  await tick();
  await call(app, "POST", `/api/ai/jobs/${id}/cancel`);
  ai.release();
  await tick();
  await tick();
  expect((await call(app, "GET", `/api/ai/jobs/${id}`)).body).toMatchObject({
    status: "cancelled",
    itemIds: [],
  });
  expect(await suggested(app)).toEqual([]);
});

test("cancelling a queued job means it never runs; a finished or unknown job cannot be cancelled", async () => {
  const ai = new GatedProvider();
  const app = build(ai);
  const first = (await start(app)).body.id;
  const second = (await start(app)).body.id;
  await tick();
  const res = await call(app, "POST", `/api/ai/jobs/${second}/cancel`);
  expect(res.body).toMatchObject({
    status: "cancelled",
    failure: "Cancelled. Nothing was saved.",
  });
  ai.release();
  await finished(app, first);
  await tick();
  expect(ai.started).toHaveLength(1);
  expect((await call(app, "POST", `/api/ai/jobs/${first}/cancel`)).status).toBe(
    409,
  );
  expect((await call(app, "POST", "/api/ai/jobs/nope/cancel")).status).toBe(
    404,
  );
  expect((await call(app, "GET", "/api/ai/jobs/nope")).status).toBe(404);
});

test("events stream progress and end with the run", async () => {
  const ai = new GatedProvider();
  const app = build(ai);
  const id = (await start(app)).body.id;
  await tick();
  const live = events(app, id);
  await tick();
  ai.release();
  const { list } = await live;
  expect(list.map((e) => e.event)).toEqual(["progress", "progress", "run"]);
  expect(list.slice(0, 2).map((e) => e.data.kind)).toEqual(["started", "done"]);
  expect(list[2]?.data).toMatchObject({ id, status: "done" });
  expect(list[2]?.data.itemIds).toHaveLength(2);
  // a browser that connects afterwards hears the same story
  expect((await events(app, id)).list).toEqual(list);
});

test("events for a run from an earlier session give just the run", async () => {
  const db = migratedDb();
  const earlier = build(
    new FakeAiProvider({ [SKILL]: output }),
    {},
    TEACHER_PRINCIPAL,
    db,
  );
  const id = (await start(earlier)).body.id;
  await finished(earlier, id);
  const later = build(
    new FakeAiProvider({ [SKILL]: output }),
    {},
    TEACHER_PRINCIPAL,
    db,
  );
  const { list } = await events(later, id);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ event: "run", data: { id, status: "done" } });
  expect((await call(later, "GET", "/api/ai/jobs/nope/events")).status).toBe(
    404,
  );
});

test("progress notes that echo her text or hold a path are replaced by plain words", async () => {
  const text = "Term plan: SECRET EXTRACT LINE about the second unit test";
  const chatty: AiProvider = {
    id: "chatty",
    available: async () => ({ ok: true }),
    async run(task, opts) {
      opts.onProgress({ kind: "started" });
      opts.onProgress({
        kind: "working",
        note: "Reading /Users/x/prototypes/resources/plan.xlsx",
      });
      opts.onProgress({ kind: "working", note: `Saw ${text.slice(10, 40)}` });
      opts.onProgress({ kind: "working", note: "Searching the web" });
      opts.onProgress({ kind: "done" });
      return {
        data: task.schema.parse(output),
        meta: {
          provider: "chatty",
          model: "m",
          skillId: SKILL,
          startedAt: NOW,
          durationMs: 1,
          sources: [],
        },
      };
    },
  };
  const app = build(chatty);
  const id = (await start(app, { text })).body.id;
  await finished(app, id);
  const { text: raw, list } = await events(app, id);
  expect(raw).not.toContain("/Users");
  expect(raw).not.toContain("SECRET");
  expect(
    list.filter((e) => e.data.kind === "working").map((e) => e.data.note),
  ).toEqual(["Working", "Working", "Searching the web"]);
});

const spy = (resource: ItemHandler["resource"] = "scheme-of-work") => {
  const applied: { item: AiItem; provenance: unknown }[] = [];
  const handler: ItemHandler = {
    ...(original as ItemHandler),
    resource,
    async apply(item, ctx) {
      await tick();
      applied.push({ item, provenance: provenanceOf(ctx, item) });
    },
  };
  registerItemHandler(SKILL, handler);
  return applied;
};
const oneItem = async (app: App) => {
  const run = await finished(app, (await start(app)).body.id);
  return { run, item: (await suggested(app))[0] as Json };
};
const review = (app: App, id: string, body: unknown) =>
  call(app, "POST", `/api/ai/items/${id}/review`, body);

test("accepting an item applies it once, with provider, model, skill, time and review state recorded", async () => {
  const applied = spy();
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { run, item } = await oneItem(app);
  const res = await review(app, item.id, { state: "accepted" });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    id: item.id,
    review: "accepted",
    reviewedAt: NOW,
  });
  expect(applied).toHaveLength(1);
  expect(applied[0]?.item).toMatchObject({
    id: item.id,
    review: "accepted",
    data: item.data,
  });
  expect(applied[0]?.provenance).toEqual({
    origin: "ai",
    ai: {
      runId: run.id,
      provider: "fake",
      model: "fake",
      skillId: SKILL,
      at: NOW,
      sources: [],
      review: "accepted",
    },
  });
  expect((await suggested(app)).map((i) => i.id)).not.toContain(item.id);
});

test("an edited item is applied with her data and marked edited", async () => {
  const applied = spy();
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { item } = await oneItem(app);
  const hers = {
    itemId: "ch3",
    title: "Markets",
    from: 4,
    to: 6,
    reason: "Mine",
    tricky: false,
  };
  const res = await review(app, item.id, { state: "edited", data: hers });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ review: "edited", data: hers });
  expect(applied[0]?.item).toMatchObject({ review: "edited", data: hers });
  expect(applied[0]?.provenance).toMatchObject({ ai: { review: "edited" } });
  const stored = (await call(app, "GET", "/api/ai/items")).body.find(
    (i: Json) => i.id === item.id,
  );
  expect(stored).toMatchObject({ review: "edited", data: hers });
});

test("an edit needs her data, and data belongs to an edit only", async () => {
  const applied = spy();
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { item } = await oneItem(app);
  expect((await review(app, item.id, { state: "edited" })).status).toBe(422);
  expect(
    (await review(app, item.id, { state: "accepted", data: { x: 1 } })).status,
  ).toBe(422);
  expect(
    (await review(app, item.id, { state: "rejected", data: { x: 1 } })).status,
  ).toBe(422);
  expect((await review(app, item.id, { state: "maybe" })).status).toBe(422);
  expect(applied).toEqual([]);
  expect((await suggested(app)).map((i) => i.id)).toContain(item.id);
});

test("rejecting an item applies nothing", async () => {
  const applied = spy();
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { item } = await oneItem(app);
  const res = await review(app, item.id, { state: "rejected" });
  expect(res.body).toMatchObject({ review: "rejected", reviewedAt: NOW });
  expect(applied).toEqual([]);
  expect((await suggested(app)).map((i) => i.id)).not.toContain(item.id);
});

test("reviewing an item twice is refused", async () => {
  const applied = spy();
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { item } = await oneItem(app);
  expect((await review(app, item.id, { state: "accepted" })).status).toBe(200);
  const again = await review(app, item.id, { state: "rejected" });
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe("already-reviewed");
  expect(applied).toHaveLength(1);
  expect(
    (await call(app, "GET", "/api/ai/items")).body.find(
      (i: Json) => i.id === item.id,
    ).review,
  ).toBe("accepted");
  expect((await review(app, "nope", { state: "accepted" })).status).toBe(404);
});

test("two reviews at the same moment apply the item once", async () => {
  const applied = spy();
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { item } = await oneItem(app);
  const both = await Promise.all([
    review(app, item.id, { state: "accepted" }),
    review(app, item.id, { state: "accepted" }),
  ]);
  expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(applied).toHaveLength(1);
});

test("when applying fails the item goes back to waiting for her", async () => {
  registerItemHandler(SKILL, {
    ...(original as ItemHandler),
    async apply() {
      throw new Error("disk full");
    },
  });
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  const { item } = await oneItem(app);
  expect(
    (await review(app, item.id, { state: "edited", data: { to: 9 } })).status,
  ).toBe(500);
  const back = (await suggested(app)).find((i) => i.id === item.id);
  expect(back).toMatchObject({
    review: "suggested",
    reviewedAt: null,
    data: item.data,
  });
});

test("a review needs the handler's own resource: a principal without it gets 403 and the item stays suggested", async () => {
  const db = migratedDb();
  const teacher = build(
    new FakeAiProvider({ [SKILL]: output }),
    {},
    TEACHER_PRINCIPAL,
    db,
  );
  const applied = spy();
  const { item } = await oneItem(teacher);
  const hod = build(
    new FakeAiProvider({ [SKILL]: output }),
    {},
    { role: "head-of-department" },
    db,
  );
  const res = await review(hod, item.id, { state: "accepted" });
  expect(res.status).toBe(403);
  expect(applied).toEqual([]);
  expect((await suggested(teacher)).map((i) => i.id)).toContain(item.id);
  expect((await start(hod)).status).toBe(403);
});

test("the test route switches the provider to off and signed-out, and reset restores fake", async () => {
  const app = build(new FakeAiProvider({ [SKILL]: output }), {
    testRoutes: true,
  });
  expect((await call(app, "GET", "/api/config")).body.ai).toMatchObject({
    mode: "fake",
    available: true,
  });

  expect(
    (await call(app, "POST", "/api/test/ai", { mode: "off" })).status,
  ).toBe(200);
  expect((await call(app, "GET", "/api/config")).body.ai).toEqual({
    mode: "off",
    available: false,
    reason: null,
  });
  expect((await start(app)).body.error.code).toBe("ai-off");

  expect(
    (await call(app, "POST", "/api/test/ai", { mode: "signed-out" })).status,
  ).toBe(200);
  expect((await call(app, "GET", "/api/config")).body.ai).toEqual({
    mode: "fake",
    available: false,
    reason: SIGNED_OUT,
  });
  const refused = await start(app);
  expect(refused.status).toBe(409);
  expect(refused.body.error.message).toBe(SIGNED_OUT);

  expect(
    (await call(app, "POST", "/api/test/ai", { mode: "fake" })).status,
  ).toBe(200);
  expect((await start(app)).status).toBe(202);
  await tickUntilIdle(app);

  await call(app, "POST", "/api/test/ai", { mode: "off" });
  expect((await call(app, "POST", "/api/test/reset")).status).toBe(200);
  expect((await call(app, "GET", "/api/config")).body.ai).toMatchObject({
    mode: "fake",
    available: true,
  });
  expect((await start(app)).status).toBe(202);
});

async function tickUntilIdle(app: App) {
  for (let i = 0; i < 200; i++) {
    const runs = (await call(app, "GET", "/api/ai/runs")).body as Json[];
    if (runs.every((r) => r.status !== "queued" && r.status !== "running"))
      return;
    await tick();
  }
}

test("the test route needs its header and exists only when test routes are on", async () => {
  const on = build(new FakeAiProvider({ [SKILL]: output }), {
    testRoutes: true,
  });
  const bare = await on.request("/api/test/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "off" }),
  });
  expect(bare.status).toBe(403);
  expect((await call(on, "GET", "/api/config")).body.ai.mode).toBe("fake");
  expect(
    (await call(on, "POST", "/api/test/ai", { mode: "sideways" })).status,
  ).toBe(422);
  const off = build(new FakeAiProvider({ [SKILL]: output }));
  expect(
    (await call(off, "POST", "/api/test/ai", { mode: "off" })).status,
  ).toBe(404);
});

test("with PLANNER_AI=fake the running app answers from fixtures/src/fake-ai.ts", async () => {
  const provider = providerFor({ ai: "fake" }, {});
  expect(provider?.id).toBe("fake");
  const app = build(provider);
  const run = await finished(app, (await start(app)).body.id);
  expect(run.status).toBe("done");
  const [item] = await suggested(app);
  expect(item.data).toEqual({
    itemId: "ch3",
    title: "Markets",
    from: 4,
    to: 5,
    reason: (FAKE_AI_OUTPUTS[SKILL] as Json).suggestions[0].reason,
    tricky: false,
  });
  expect(item.data.reason.length).toBeGreaterThan(10);
});

test("the server restarts with a job marked running: it is marked failed with 'The planner was closed while this was running.'", async () => {
  const db = migratedDb();
  const before = build(
    new FakeAiProvider({ [SKILL]: output }),
    {},
    TEACHER_PRINCIPAL,
    db,
  );
  const done = (await start(before)).body.id;
  await finished(before, done);
  const insert = db.prepare(
    "insert into ai_runs (id, skill_id, status, started_at) values (?, ?, ?, ?)",
  );
  insert.run("was-running", SKILL, "running", NOW);
  insert.run("was-queued", SKILL, "queued", NOW);
  const after = build(
    new FakeAiProvider({ [SKILL]: output }),
    {},
    TEACHER_PRINCIPAL,
    db,
  );
  for (const id of ["was-running", "was-queued"])
    expect((await call(after, "GET", `/api/ai/jobs/${id}`)).body).toMatchObject(
      {
        status: "failed",
        failure: "The planner was closed while this was running.",
      },
    );
  expect((await call(after, "GET", `/api/ai/jobs/${done}`)).body.status).toBe(
    "done",
  );
});

test("a job with an input the skill does not accept fails as a sentence, and a bad request is a 422", async () => {
  const app = build(new FakeAiProvider({ [SKILL]: output }));
  expect(
    (
      await call(app, "POST", "/api/ai/jobs", {
        skillId: "not-a-skill",
        input: {},
      })
    ).status,
  ).toBe(422);
  const res = await start(app, { input: { nonsense: true } });
  expect(res.status).toBe(202);
  const run = await finished(app, res.body.id);
  expect(run).toMatchObject({
    status: "failed",
    failure: "Claude stopped with an error. Nothing was saved.",
  });
});

test("a provider's words about availability never reach the browser: config, the refusal and the failed run show a fixed sentence", async () => {
  const leaky = "Cannot run /Users/someone/x: spawn ENOENT";
  const refusing = new FakeAiProvider({ [SKILL]: output });
  refusing.available = async () => ({ ok: false, reason: leaky });
  const app = build(refusing);
  const config = (await call(app, "GET", "/api/config")).body.ai;
  expect(config.reason).toBe(
    "Claude stopped with an error. Nothing was saved.",
  );
  const refused = await start(app);
  expect(refused.status).toBe(409);
  expect(refused.body.error.message).toBe(config.reason);

  let asked = 0;
  const late = new FakeAiProvider({ [SKILL]: output });
  late.available = async () =>
    ++asked <= 2 ? { ok: true } : { ok: false, reason: leaky };
  const app2 = build(late);
  await tick();
  const id = (await start(app2)).body.id;
  const run = await finished(app2, id);
  expect(run.failure).toBe("Claude stopped with an error. Nothing was saved.");
  const { text } = await events(app2, id);
  expect(text).not.toContain("/Users");
  expect(text).not.toContain("ENOENT");
  expect(text).toContain(run.failure);
});
