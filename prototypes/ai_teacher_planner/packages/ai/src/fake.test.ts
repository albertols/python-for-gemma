import { describe, expect, test } from "vitest";
import { z } from "zod";
import { FakeAiProvider } from "./fake.ts";
import type { AiProgress, AiTask } from "./port.ts";
import { suggestLessonCounts } from "./skills/planner-suggest-lesson-counts.ts";

const input = {
  courseTitle: "Synthetic Business",
  mode: "differences",
  items: [{ id: "c1", title: "Chapter one", lessons: 3 }],
  unitTotals: [{ unitId: "u1", lessons: 3 }],
};
const good = {
  suggestions: [{ itemId: "c1", lessons: 4, reason: "dense", tricky: false }],
};
const task: AiTask<z.infer<typeof suggestLessonCounts.output>> = {
  skillId: "planner-suggest-lesson-counts",
  input,
  text: null,
  attachments: [],
  schema: suggestLessonCounts.output,
  tools: [],
};
const opts = () => {
  const progress: AiProgress[] = [];
  return {
    progress,
    opts: {
      signal: new AbortController().signal,
      onProgress: (p: AiProgress) => progress.push(p),
    },
  };
};

describe("FakeAiProvider", () => {
  test("the fake returns its fixture, validated against the task's schema", async () => {
    const fake = new FakeAiProvider({ "planner-suggest-lesson-counts": good });
    const r = await fake.run(task, opts().opts);
    expect(r.data).toEqual(good);
    expect(r.meta).toMatchObject({
      provider: "fake",
      skillId: "planner-suggest-lesson-counts",
      sources: [],
    });
    // a fixture may be a function of the input
    const fn = new FakeAiProvider({
      "planner-suggest-lesson-counts": (i: unknown) => ({
        suggestions: [
          {
            itemId: (i as typeof input).items[0]?.id,
            lessons: 1,
            reason: "x",
            tricky: true,
          },
        ],
      }),
    });
    const r2 = await fn.run(task, opts().opts);
    expect(r2.data.suggestions[0]?.itemId).toBe("c1");
  });

  test("a fixture that does not match the schema fails with invalid-output", async () => {
    const fake = new FakeAiProvider({
      "planner-suggest-lesson-counts": { suggestions: [{ itemId: "c1" }] },
    });
    const o = opts();
    await expect(fake.run(task, o.opts)).rejects.toMatchObject({
      reason: "invalid-output",
    });
    expect(o.progress.at(-1)).toMatchObject({ kind: "failed" });
  });

  test("a skill with no fixture fails rather than inventing data", async () => {
    const fake = new FakeAiProvider({});
    await expect(fake.run(task, opts().opts)).rejects.toMatchObject({
      reason: "failed",
    });
  });

  test("the fake records each call and reports started then done", async () => {
    const fake = new FakeAiProvider({ "planner-suggest-lesson-counts": good });
    const o = opts();
    await fake.run(task, o.opts);
    await fake.run({ ...task, text: "extracted" }, o.opts);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.input).toEqual(input);
    expect(fake.calls[1]?.text).toBe("extracted");
    expect(o.progress.map((p) => p.kind)).toEqual([
      "started",
      "done",
      "started",
      "done",
    ]);
  });

  test("the fake can be told to fail, and honours the abort signal", async () => {
    const failing = new FakeAiProvider(
      { "planner-suggest-lesson-counts": good },
      { fail: "signed-out" },
    );
    const o = opts();
    await expect(failing.run(task, o.opts)).rejects.toMatchObject({
      reason: "signed-out",
    });
    expect(o.progress.map((p) => p.kind)).toEqual(["started", "failed"]);
    expect(failing.calls).toHaveLength(1);

    // already aborted: never answers
    const fake = new FakeAiProvider({ "planner-suggest-lesson-counts": good });
    const ac = new AbortController();
    ac.abort();
    await expect(
      fake.run(task, { signal: ac.signal, onProgress: () => {} }),
    ).rejects.toMatchObject({ reason: "cancelled" });

    // aborted while waiting
    const slow = new FakeAiProvider(
      { "planner-suggest-lesson-counts": good },
      { delayMs: 5000 },
    );
    const ac2 = new AbortController();
    const pending = slow.run(task, {
      signal: ac2.signal,
      onProgress: () => {},
    });
    ac2.abort();
    await expect(pending).rejects.toMatchObject({ reason: "cancelled" });
  });

  test("the fake runs the same input and path checks as the real prompt builder", async () => {
    const fake = new FakeAiProvider({ "planner-suggest-lesson-counts": good });
    await expect(
      fake.run({ ...task, input: { courseTitle: 1 } }, opts().opts),
    ).rejects.toMatchObject({ reason: "failed" });
    await expect(
      fake.run({ ...task, text: "see ../resources/a.pdf" }, opts().opts),
    ).rejects.toMatchObject({ reason: "failed" });
  });

  test("a task whose schema or tools are not the registered skill's is refused", async () => {
    const fake = new FakeAiProvider({ "planner-suggest-lesson-counts": good });
    await expect(
      fake.run({ ...task, schema: z.unknown() }, opts().opts),
    ).rejects.toMatchObject({ reason: "failed", message: /schema/ });
    await expect(
      fake.run({ ...task, tools: ["WebFetch"] }, opts().opts),
    ).rejects.toMatchObject({ reason: "failed", message: /tools/ });
  });

  test("a fixture function that throws becomes a failed AiError with a failed event", async () => {
    const fake = new FakeAiProvider({
      "planner-suggest-lesson-counts": () => {
        throw new Error("boom");
      },
    });
    const o = opts();
    await expect(fake.run(task, o.opts)).rejects.toMatchObject({
      reason: "failed",
    });
    expect(o.progress.at(-1)).toMatchObject({ kind: "failed" });
  });

  test("it reports itself available", async () => {
    expect(await new FakeAiProvider({}).available()).toEqual({ ok: true });
  });
});
