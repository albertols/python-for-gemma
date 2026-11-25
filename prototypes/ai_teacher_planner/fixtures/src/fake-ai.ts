import { SEED_TIMETABLE } from "./seed.ts";

/**
 * A picture of the seeded timetable as the fake reads it: IB H's Week 1 Monday room is read as 607
 * (the seed says 605), and the Week 1 Tuesday period 1 cell is smudged, so it is left empty and
 * reported as unsure. Everything else is exactly the seed.
 */
const READ_FROM_PICTURE = {
  entries: SEED_TIMETABLE.entries
    .filter((e) => !(e.week === "W1" && e.weekday === 2 && e.period === 1))
    .map((e) =>
      e.week === "W1" && e.weekday === 1 && e.period === 1
        ? { ...e, room: "607" }
        : e,
    ),
  duties: SEED_TIMETABLE.duties,
  unsure: [
    {
      week: "W1",
      weekday: 2,
      period: 1,
      note: "The code in this cell is smudged.",
    },
  ],
};

/**
 * What the fake AI answers in the running app (`PLANNER_AI=fake`): one canned output per skill,
 * keyed by skill id. The planner's FakeAiProvider checks each one against the skill's schema.
 * Synthetic only: it matches the seeded scheme and holds no real names.
 */
export const FAKE_AI_OUTPUTS: Record<string, unknown> = {
  "planner-import-timetable": READ_FROM_PICTURE,
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
