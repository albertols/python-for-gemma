import { FakeAiProvider } from "@planner/ai/fake";
import { expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import { createRepos } from "../repos/sqlite/index.ts";
import { migratedDb, testConfig } from "../test-support.ts";
import {
  getItemHandler,
  type ItemHandler,
  type JobContext,
  registerItemHandler,
  startJob,
  whenIdle,
} from "./ai-jobs.ts";
import { reviewItem } from "./review-item.ts";

const SKILL = "planner-suggest-lesson-counts" as const;
const output = {
  suggestions: [{ itemId: "ch3", lessons: 5, reason: "r", tricky: false }],
};
const input = {
  courseTitle: "Synthetic Economics",
  mode: "differences",
  items: [{ id: "ch3", title: "Markets", lessons: 4 }],
  unitTotals: [{ unitId: "u1", lessons: 20 }],
};

async function suggestedItem(courseId?: string) {
  const ctx: JobContext = {
    repos: createRepos(migratedDb()),
    ai: new FakeAiProvider({ [SKILL]: output }),
    now: () => new Date("2026-11-24T10:00:00Z"),
    config: testConfig,
  };
  ctx.repos.courses.seed([
    { id: "ial-business-u4", title: "IAL", board: "IAL", revisionWeeks: 2 },
  ]);
  startJob(ctx, {
    skillId: SKILL,
    input: courseId === undefined ? input : { ...input, courseId },
    text: null,
    attachments: [],
  });
  await whenIdle(ctx);
  const [item] = ctx.repos.ai.listItems();
  if (!item) throw new Error("the job stored no item");
  return { ctx, item };
}
const handlerFor = (resource: ItemHandler["resource"]) => {
  const applied: string[] = [];
  const original = getItemHandler(SKILL) as ItemHandler;
  registerItemHandler(SKILL, {
    ...original,
    resource,
    async apply(item) {
      applied.push(item.id);
    },
  });
  return { applied, restore: () => registerItemHandler(SKILL, original) };
};

test("a lesson-count item needs scheme-of-work: the head of department has it, so the review goes through", async () => {
  const { ctx, item } = await suggestedItem();
  const { applied, restore } = handlerFor("scheme-of-work");
  try {
    const done = await reviewItem(
      ctx,
      { role: "head-of-department" },
      item.id,
      { state: "accepted" },
    );
    expect(done.review).toBe("accepted");
    expect(applied).toEqual([item.id]);
  } finally {
    restore();
  }
});

test("a timetable-grid item needs lesson-plans: the head of department only views it, so the review is refused and nothing changes", async () => {
  const { ctx, item } = await suggestedItem();
  const { applied, restore } = handlerFor("lesson-plans");
  try {
    const refusal = await reviewItem(
      ctx,
      { role: "head-of-department" },
      item.id,
      { state: "accepted" },
    ).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal).toMatchObject({ status: 403, code: "forbidden" });
    expect(applied).toEqual([]);
    expect(ctx.repos.ai.getItem(item.id)).toMatchObject({
      review: "suggested",
      reviewedAt: null,
    });
    const teacher = await reviewItem(ctx, { role: "teacher" }, item.id, {
      state: "rejected",
    });
    expect(teacher.review).toBe("rejected");
  } finally {
    restore();
  }
});

test("an item naming a course that does not exist is refused when she accepts it, and nothing is applied", async () => {
  const { ctx, item } = await suggestedItem("no-such-course");
  expect(item.courseId).toBe("no-such-course");
  const { applied, restore } = handlerFor("scheme-of-work");
  try {
    const refusal = await reviewItem(ctx, { role: "teacher" }, item.id, {
      state: "accepted",
    }).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal).toMatchObject({ status: 422, code: "unknown-course" });
    expect(applied).toEqual([]);
    expect(ctx.repos.ai.getItem(item.id)?.review).toBe("suggested");
    // rejecting applies nothing, so it is allowed
    const rejected = await reviewItem(ctx, { role: "teacher" }, item.id, {
      state: "rejected",
    });
    expect(rejected.review).toBe("rejected");
  } finally {
    restore();
  }
});

test("an item naming one of her courses is applied", async () => {
  const { ctx, item } = await suggestedItem("ial-business-u4");
  const { applied, restore } = handlerFor("scheme-of-work");
  try {
    await reviewItem(ctx, { role: "teacher" }, item.id, { state: "accepted" });
    expect(applied).toEqual([item.id]);
  } finally {
    restore();
  }
});
