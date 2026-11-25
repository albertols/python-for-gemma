import { expect, test } from "vitest";
import {
  type AiItemView,
  type AiRunView,
  chipView,
  countOf,
  describeItem,
  initialJob,
  liveRun,
  parseEvent,
  provenanceOf,
  reduceJob,
} from "./jobs.ts";

const run = (over: Partial<AiRunView>): AiRunView => ({
  id: "r1",
  skillId: "planner-suggest-lesson-counts",
  status: "queued",
  startedAt: "2026-11-24T10:00:00.000Z",
  durationMs: null,
  provider: null,
  model: null,
  failure: null,
  itemIds: [],
  ...over,
});
const item = (over: Partial<AiItemView>): AiItemView => ({
  id: "i1",
  runId: "r1",
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
  ...over,
});

test("progress notes replace each other and the final run ends the job", () => {
  let s = reduceJob(initialJob, {
    type: "progress",
    progress: { kind: "started" },
  });
  expect(s.note).toBeNull();
  s = reduceJob(s, {
    type: "progress",
    progress: { kind: "working", note: "Reading the scheme" },
  });
  expect(s.note).toBe("Reading the scheme");
  s = reduceJob(s, {
    type: "progress",
    progress: { kind: "working", note: "Checking the answer" },
  });
  expect(s.note).toBe("Checking the answer");
  expect(s.ended).toBe(false);
  const done = run({ status: "done" });
  s = reduceJob(s, { type: "run", run: done });
  expect(s.ended).toBe(true);
  expect(s.run).toEqual(done);
  expect(s.note).toBeNull();
});

test("a failure is the API's sentence, kept for the chip", () => {
  const s = reduceJob(initialJob, {
    type: "progress",
    progress: {
      kind: "failed",
      reason: "Claude took too long and was stopped.",
    },
  });
  expect(s.failed).toBe("Claude took too long and was stopped.");
});

test("events from the stream are read, and rubbish is ignored", () => {
  expect(parseEvent("progress", '{"kind":"working","note":"Reading"}')).toEqual(
    {
      type: "progress",
      progress: { kind: "working", note: "Reading" },
    },
  );
  expect(parseEvent("run", JSON.stringify(run({ status: "done" })))?.type).toBe(
    "run",
  );
  expect(parseEvent("progress", "not json")).toBeNull();
  expect(parseEvent("progress", '{"kind":"surprise"}')).toBeNull();
  expect(parseEvent("run", '{"id":1}')).toBeNull();
});

test("the live run is the running one, else the oldest queued one", () => {
  const runs = [
    run({ id: "c", status: "queued", startedAt: "2026-11-24T10:02:00.000Z" }),
    run({ id: "b", status: "queued", startedAt: "2026-11-24T10:01:00.000Z" }),
    run({ id: "a", status: "done" }),
  ];
  expect(liveRun(runs)?.id).toBe("b");
  expect(liveRun([run({ id: "r", status: "running" }), ...runs])?.id).toBe("r");
  expect(
    liveRun([run({ status: "done" }), run({ status: "failed" })]),
  ).toBeNull();
});

const ON = { mode: "fake", available: true, reason: null } as const;

test("the chip says why the AI is off or unavailable, and shows a running job", () => {
  expect(
    chipView({ ...ON, mode: "off", available: false }, null, null),
  ).toEqual({
    kind: "off",
    text: "AI is switched off",
  });
  expect(
    chipView(
      {
        mode: "claude",
        available: false,
        reason:
          "Claude Code is signed out. Run `claude` in a terminal and sign in, then try again.",
      },
      null,
      null,
    ),
  ).toEqual({
    kind: "unavailable",
    text: "AI unavailable: Claude Code is signed out. Run `claude` in a terminal and sign in, then try again.",
  });
  expect(chipView(ON, null, null)).toEqual({ kind: "idle" });
  expect(
    chipView(ON, run({ status: "running" }), "Reading the scheme"),
  ).toMatchObject({
    kind: "working",
    text: "AI is working: Reading the scheme",
  });
  expect(chipView(ON, run({ status: "running" }), null)).toMatchObject({
    kind: "working",
    text: "AI is working",
  });
  expect(chipView(ON, run({ status: "queued" }), null)).toMatchObject({
    kind: "working",
    text: "AI is waiting its turn",
  });
});

test("a job still shows while the AI is switched off after it started", () => {
  expect(
    chipView(
      { ...ON, mode: "off", available: false },
      run({ status: "running" }),
      null,
    ).kind,
  ).toBe("working");
});

test("an item is described in her words, with a fallback for kinds not built yet", () => {
  expect(describeItem(item({}))).toEqual({
    title: "Markets: 4 to 5 lessons",
    detail: "Needs worked examples.",
  });
  expect(
    describeItem(
      item({
        data: {
          itemId: "ch3",
          title: null,
          from: null,
          to: 3,
          reason: "x",
          tricky: false,
        },
      }),
    ).title,
  ).toBe("ch3: 3 lessons");
  expect(describeItem(item({ kind: "mystery", data: 42 }))).toEqual({
    title: "mystery for ch3",
    detail: null,
  });
});

test("an item and its run make the provenance the popover shows", () => {
  const r = run({
    status: "done",
    provider: "fake",
    model: "fake",
  });
  expect(
    provenanceOf(
      r,
      item({
        review: "edited",
        sources: [{ url: "https://e.test", title: null, opened: true }],
      }),
    ),
  ).toEqual({
    origin: "ai",
    ai: {
      runId: "r1",
      provider: "fake",
      model: "fake",
      skillId: "planner-suggest-lesson-counts",
      at: "2026-11-24T10:00:00.000Z",
      sources: [{ url: "https://e.test", title: null, opened: true }],
      review: "edited",
    },
  });
});

test("a lesson count is read only from data of the right shape", () => {
  expect(countOf(item({}))).toBe(5);
  expect(countOf(item({ data: null }))).toBeNull();
  expect(countOf(item({ data: { to: "5" } }))).toBeNull();
  expect(countOf(item({ data: { to: 0 } }))).toBeNull();
  expect(countOf(item({ kind: "mystery" }))).toBeNull();
});
