import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPrompt, getSkill } from "@planner/ai";
import { FakeAiProvider } from "@planner/ai/fake";
import { IMPORTED } from "@planner/domain";
import { expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import { createRepos } from "../repos/sqlite/index.ts";
import { createPackStore } from "../repos/sqlite/pack-store.ts";
import { migratedDb, testConfig } from "../test-support.ts";
import { type JobContext, whenIdle } from "./ai-jobs.ts";
import { firstRun } from "./first-run.ts";
import { reviewItem } from "./review-item.ts";
import { seedM2 } from "./seed-m2.ts";
import { suggestCounts } from "./suggest-counts.ts";

const SKILL = "planner-suggest-lesson-counts" as const;
const COURSE = "ial-business-u4";
const NOW = new Date("2026-11-25T10:00:00Z");
const TEACHER = { role: "teacher" } as const;

type Suggestion = {
  itemId: string;
  lessons: number;
  reason: string;
  tricky: boolean;
};
const says = (itemId: string, lessons: number, tricky = false): Suggestion => ({
  itemId,
  lessons,
  reason: `reason for ${itemId}`,
  tricky,
});

/** The synthetic scheme: ch1 Demand 3, ch2 Supply 4, ch3 Markets 4, ch4 Prices 2, with two assessments. */
async function world(suggestions: Suggestion[]) {
  const db = migratedDb();
  const repos = createRepos(db);
  firstRun(repos);
  const packs = createPackStore(
    db,
    fs.mkdtempSync(path.join(os.tmpdir(), "counts-")),
  );
  await seedM2(repos, packs, () => NOW, "m2-no-positions");
  const ai = new FakeAiProvider({ [SKILL]: { suggestions } });
  const ctx: JobContext = { repos, ai, now: () => NOW, config: testConfig };
  return { ctx, repos, packs, ai };
}

const countsOf = (repos: JobContext["repos"]) =>
  Object.fromEntries(repos.scheme.items(COURSE).map((i) => [i.id, i.lessons]));
const SEEDED = { ch1: 3, ch2: 4, "a-ch2": 0, ch3: 4, "a-ch3": 0, ch4: 2 };

async function run(
  w: Awaited<ReturnType<typeof world>>,
  mode: "differences" | "split" = "differences",
) {
  const started = suggestCounts(w.ctx, w.packs, COURSE, mode);
  await whenIdle(w.ctx);
  return w.repos.ai.getRun(started.id);
}

test("each suggestion that differs from her number becomes one item; equal ones become none", async () => {
  // ch3 Markets 4 -> 5 and ch4 Prices 2 -> 3 differ; ch2 Supply 4 -> 4 is equal
  const w = await world([says("ch3", 5, true), says("ch2", 4), says("ch4", 3)]);
  const done = await run(w);
  expect(done?.status).toBe("done");
  expect(
    w.repos.ai.listItems().map((i) => ({
      kind: i.kind,
      target: i.target,
      review: i.review,
      data: i.data,
    })),
  ).toEqual([
    {
      kind: "lesson-count",
      target: "ch3",
      review: "suggested",
      data: {
        itemId: "ch3",
        title: "Markets",
        from: 4,
        to: 5,
        reason: "reason for ch3",
        tricky: true,
      },
    },
    {
      kind: "lesson-count",
      target: "ch4",
      review: "suggested",
      data: {
        itemId: "ch4",
        title: "Prices",
        from: 2,
        to: 3,
        reason: "reason for ch4",
        tricky: false,
      },
    },
  ]);
});

test("accepting a suggestion changes that item's count and records AI provenance", async () => {
  const w = await world([says("ch3", 5), says("ch4", 3)]);
  const done = await run(w);
  const item = w.repos.ai.listItems().find((i) => i.target === "ch3");
  if (!item) throw new Error("no item for ch3");
  await reviewItem(w.ctx, TEACHER, item.id, { state: "accepted" });
  expect(countsOf(w.repos)).toEqual({ ...SEEDED, ch3: 5 });
  const ch3 = w.repos.scheme.items(COURSE).find((i) => i.id === "ch3");
  expect(ch3?.provenance).toEqual({
    origin: "ai",
    ai: {
      runId: done?.id,
      provider: "fake",
      model: "fake",
      skillId: SKILL,
      at: NOW.toISOString(),
      sources: [],
      review: "accepted",
    },
  });
  // the other suggestion is untouched, and so is every other item's origin
  const others = w.repos.scheme.items(COURSE).filter((i) => i.id !== "ch3");
  expect(others.every((i) => i.provenance.origin === "import")).toBe(true);
  expect(others.find((i) => i.id === "ch4")?.provenance).toEqual(IMPORTED);
});

test("her own number is stored with review edited; a number that is not a whole 0 to 99 is refused and nothing changes", async () => {
  const w = await world([says("ch3", 5)]);
  await run(w);
  const [item] = w.repos.ai.listItems();
  if (!item) throw new Error("no item");
  for (const to of [100, -1, 2.5, "6", null]) {
    const refusal = await reviewItem(w.ctx, TEACHER, item.id, {
      state: "edited",
      data: { ...(item.data as object), to },
    }).catch((e: unknown) => e);
    expect(refusal, String(to)).toBeInstanceOf(ApiError);
    expect(refusal, String(to)).toMatchObject({ status: 422 });
    expect(countsOf(w.repos)).toEqual(SEEDED);
    expect(w.repos.ai.getItem(item.id)?.review).toBe("suggested");
  }
  await reviewItem(w.ctx, TEACHER, item.id, {
    state: "edited",
    data: { ...(item.data as object), to: 0 },
  });
  expect(countsOf(w.repos)).toEqual({ ...SEEDED, ch3: 0 });
  expect(
    w.repos.scheme.items(COURSE).find((i) => i.id === "ch3")?.provenance.ai
      ?.review,
  ).toBe("edited");
});

test("rejecting changes nothing in the scheme; an assessment is never given lessons", async () => {
  const w = await world([says("ch3", 5)]);
  await run(w);
  const [item] = w.repos.ai.listItems();
  if (!item) throw new Error("no item");
  await reviewItem(w.ctx, TEACHER, item.id, { state: "rejected" });
  expect(countsOf(w.repos)).toEqual(SEEDED);

  const second = await world([says("ch3", 5)]);
  await run(second);
  const [again] = second.repos.ai.listItems();
  if (!again) throw new Error("no item");
  // the scheme changed under her: ch3 became an assessment's id, so the count has nowhere to go
  const items = second.repos.scheme.items(COURSE).filter((i) => i.id !== "ch3");
  second.repos.scheme.replace(COURSE, items, []);
  const refusal = await reviewItem(second.ctx, TEACHER, again.id, {
    state: "accepted",
  }).catch((e: unknown) => e);
  expect(refusal).toMatchObject({ status: 422, code: "no-such-item" });
  expect(second.repos.ai.getItem(again.id)?.review).toBe("suggested");
});

test("a suggestion for an item that does not exist is dropped and reported in the run", async () => {
  const w = await world([says("ch9", 3), says("ch3", 5), says("a-ch2", 2)]);
  const done = await run(w);
  expect(done?.status).toBe("done");
  expect(w.repos.ai.listItems().map((i) => i.target)).toEqual(["ch3"]);
  expect(done?.failure).toBe(
    "2 suggestions were left out: they did not match a chapter of this scheme.",
  );
});

test("one dropped suggestion is reported in the singular, and a repeated item counts as dropped", async () => {
  const w = await world([says("ch9", 3), says("ch3", 5), says("ch3", 6)]);
  const done = await run(w);
  expect(
    w.repos.ai
      .listItems()
      .map((i) => [i.target, (i.data as { to: number }).to]),
  ).toEqual([["ch3", 5]]);
  expect(done?.failure).toBe(
    "2 suggestions were left out: they did not match a chapter of this scheme.",
  );
  const one = await world([says("ch9", 3), says("ch3", 5)]);
  expect((await run(one))?.failure).toBe(
    "1 suggestion was left out: it did not match a chapter of this scheme.",
  );
});

test("a run with nothing dropped reports nothing", async () => {
  const w = await world([says("ch3", 5)]);
  expect((await run(w))?.failure).toBeNull();
});

test("nothing changes in the scheme until she reviews", async () => {
  const w = await world([says("ch3", 5), says("ch4", 3)]);
  const before = {
    items: w.repos.scheme.items(COURSE),
    overrides: w.repos.scheme.overrides(COURSE),
  };
  await run(w);
  expect(w.repos.ai.listItems().map((i) => i.review)).toEqual([
    "suggested",
    "suggested",
  ]);
  expect({
    items: w.repos.scheme.items(COURSE),
    overrides: w.repos.scheme.overrides(COURSE),
  }).toEqual(before);
});

test("the input sent to the model holds titles and counts only", async () => {
  const w = await world([says("ch3", 5)]);
  await run(w);
  const call = w.ai.calls[0];
  const skill = getSkill(SKILL);
  const sent = skill.input.parse(call?.input);
  expect(sent).toEqual({
    courseTitle: "IAL Business Unit 4",
    mode: "differences",
    items: [
      { id: "ch1", title: "Demand", lessons: 3 },
      { id: "ch2", title: "Supply", lessons: 4 },
      { id: "ch3", title: "Markets", lessons: 4 },
      { id: "ch4", title: "Prices", lessons: 2 },
    ],
    unitTotals: [{ unitId: "u1", lessons: 13 }],
  });
  const prompt = buildPrompt(skill, "S", call?.input, null);
  // no dates, no group names, no file names, no notes, no assessments
  for (const leak of [
    "2026",
    "13 1",
    "13 3",
    "13 5",
    ".xlsx",
    ".pdf",
    "started last year",
    "mark",
  ])
    expect(prompt, leak).not.toContain(leak);
});

test("the mode she asks for reaches the model", async () => {
  const w = await world([says("ch3", 5)]);
  await run(w, "split");
  expect(skillInput(w.ai.calls[0]?.input).mode).toBe("split");
});
const skillInput = (input: unknown) =>
  getSkill(SKILL).input.parse(input) as { mode: string };

test("each item carries the course id of the item it changes", async () => {
  const w = await world([says("ch3", 5), says("ch4", 3)]);
  await run(w);
  expect(w.repos.ai.listItems().map((i) => i.courseId)).toEqual([
    "ial-business-u4",
    "ial-business-u4",
  ]);
});

test("a course without a locked pack or scheme is refused before any job starts", async () => {
  const w = await world([says("ch3", 5)]);
  expect(() => suggestCounts(w.ctx, w.packs, "no-such-course")).toThrow(
    ApiError,
  );
  expect(w.repos.ai.listRuns()).toEqual([]);
});
