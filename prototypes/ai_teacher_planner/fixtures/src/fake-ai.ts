/**
 * What the fake AI answers in the running app (`PLANNER_AI=fake`): one canned output per skill,
 * keyed by skill id. The planner's FakeAiProvider checks each one against the skill's schema.
 * Synthetic only: it matches the seeded scheme and holds no real names.
 */
export const FAKE_AI_OUTPUTS: Record<string, unknown> = {
  // Chapter 3, "Markets": one more lesson, with a reason she can read.
  "planner-suggest-lesson-counts": {
    suggestions: [
      {
        itemId: "ch3",
        lessons: 5,
        reason:
          "Demand and supply need a fifth lesson for worked examples before the first assessment.",
        tricky: false,
      },
    ],
  },
};
