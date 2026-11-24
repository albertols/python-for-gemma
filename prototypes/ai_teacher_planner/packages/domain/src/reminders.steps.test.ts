import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { featureFile, SEED_GROUPS } from "@planner/fixtures";
import { expect } from "vitest";
import { type Reminder, reminders } from "./reminders.ts";

const feature = await loadFeature(featureFile("15-report-reminder"));
describeFeature(feature, ({ Scenario }) => {
  Scenario("Report reminder", ({ Given, When, Then }) => {
    let deadline = "";
    let shown: Reminder[] = [];
    Given("the Year 11 long-report data deadline is 30 Nov 2026", () => {
      deadline = "2026-11-30";
    });
    When("I open Today on 20 Nov", () => {
      shown = reminders({
        today: "2026-11-20",
        windows: [
          {
            id: "y11-long",
            yearGroup: 11,
            programme: null,
            name: "Report 2: Long",
            dataDeadline: deadline,
            hodReview: null,
            sentHome: null,
          },
        ],
        evenings: [],
        exams: [],
        groups: SEED_GROUPS,
        horizonDays: 14,
      });
    });
    Then("the reminder is shown with the days remaining", () => {
      expect(shown).toHaveLength(1);
      expect(shown[0]).toMatchObject({
        kind: "report-data-deadline",
        date: "2026-11-30",
        daysLeft: 10,
      });
    });
  });
});
