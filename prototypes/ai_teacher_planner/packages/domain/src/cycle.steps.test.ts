import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  featureFile,
  SEED_GROUPS,
  SEED_TIMETABLE,
  SYNTHETIC_TERMS,
  syntheticRows,
} from "@planner/fixtures";
import { expect } from "vitest";
import { toCalendarDays } from "./calendar.ts";
import { buildSlots, type Slot } from "./slots.ts";

const days = toCalendarDays(syntheticRows(), SYNTHETIC_TERMS);
const slots = buildSlots({
  days,
  timetables: [SEED_TIMETABLE],
  groups: SEED_GROUPS,
  disruptions: [],
});
const between = (from: string, to: string): Slot[] =>
  slots.filter((s) => s.date >= from && s.date <= to);
const label = (date: string) => days.find((d) => d.date === date)?.weekLabel;
const countsOf = (list: Slot[]) => {
  const counts: Record<string, number> = {};
  for (const s of list) counts[s.groupId] = (counts[s.groupId] ?? 0) + 1;
  return counts;
};

const one = await loadFeature(featureFile("01-cycle-from-calendar"));
describeFeature(one, ({ Scenario }) => {
  Scenario(
    "The cycle comes from the calendar",
    ({ Given, When, Then, And }) => {
      let week: Slot[] = [];
      Given(
        "12 Feb 2027 is labelled Week 2 and 15 to 19 Feb are school holidays",
        () => {
          expect(label("2027-02-12")).toBe("W2");
          expect(between("2027-02-15", "2027-02-19")).toEqual([]);
        },
      );
      When("I open the week of 22 Feb", () => {
        week = between("2027-02-22", "2027-02-26");
      });
      Then("it is Week 1", () => {
        expect(week.length).toBeGreaterThan(0);
        expect(week.every((s) => s.weekLabel === "W1")).toBe(true);
      });
      And("each group has its Week 1 lessons", () => {
        expect(countsOf(week)).toEqual({
          "11D": 3,
          "IB H": 2,
          "IB S": 3,
          "13 1": 3,
          "13 3": 3,
          "13 5": 3,
        });
      });
    },
  );
});

const two = await loadFeature(featureFile("02-two-day-week"));
describeFeature(two, ({ Scenario }) => {
  Scenario("Only the first two days of Week 2 exist", ({ Given, Then }) => {
    Given("21 and 22 Dec 2026 are labelled Week 2", () => {
      expect(label("2026-12-21")).toBe("W2");
      expect(label("2026-12-22")).toBe("W2");
    });
    Then("only the Monday and Tuesday Week 2 lessons exist that week", () => {
      const week = between("2026-12-21", "2026-12-25");
      expect(countsOf(week)).toEqual({
        "IB H": 2,
        "13 1": 1,
        "13 5": 1,
        "11D": 2,
        "13 3": 1,
      });
      expect(week.some((s) => s.groupId === "IB S")).toBe(false);
      expect(week.every((s) => s.date <= "2026-12-22")).toBe(true);
    });
  });
});

const three = await loadFeature(featureFile("03-one-day-week"));
describeFeature(three, ({ Scenario }) => {
  Scenario("One lesson in one week", ({ Given, Then }) => {
    Given("Friday 8 Jan 2027 alone is labelled Week 1", () => {
      expect(label("2027-01-08")).toBe("W1");
      expect(label("2027-01-07")).toBeNull();
    });
    Then(
      "13 1 has one lesson that week, in period 6, and no other group has any",
      () => {
        const week = between("2027-01-04", "2027-01-08");
        expect(week).toHaveLength(1);
        expect(week[0]?.key).toBe("13 1|2027-01-08|6");
      },
    );
  });
});

const four = await loadFeature(featureFile("04-staff-days"));
describeFeature(four, ({ Scenario }) => {
  Scenario("No lessons on a staff training day", ({ Given, Then }) => {
    Given("1 Sep 2026 is labelled Week 1 and marked staff training", () => {
      const day = days.find((d) => d.date === "2026-09-01");
      expect(day?.weekLabel).toBe("W1");
      expect(day?.pupilDay).toBe(false);
    });
    Then("no group has a lesson that day", () => {
      expect(slots.filter((s) => s.date === "2026-09-01")).toEqual([]);
    });
  });
});
