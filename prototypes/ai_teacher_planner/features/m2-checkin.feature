@e2e
Feature: Weekly check-in

  # Today is fixed at Friday 20 November 2026 and the plan was accepted on
  # 26 October, so three weeks are waiting: 26 Oct, 9 Nov and 16 Nov.

  Scenario: One click confirms a group's week
    Given last week's lessons have not been confirmed
    When I confirm last week for 13 1
    Then the check-in says "Confirmed 13 1 for the week of Monday 16 November." with the focus on it
    And 13 1 no longer appears in the check-in for that week
    And 13 1's lessons for that week are shown as taught on the board
    And 13 3's lessons for that week are still only assumed

  Scenario: A skipped lesson offers a new plan
    Given last week's lessons have not been confirmed
    When I mark one of 13 3's lessons as skipped with the note "Fire drill"
    Then I see that the plan is out of date and can preview the change
    And the note was saved with the answer
    And the preview labels the skipped lesson as a correction

  Scenario: Three weeks away
    Given three weeks of lessons have not been confirmed
    Then the check-in shows three weeks, oldest first
    And Today still shows today's lessons above it

  Scenario: Everything confirmed leaves one line
    Given three weeks of lessons have not been confirmed
    When I confirm every group in every week
    Then the check-in says "Nothing to confirm: every past lesson has an answer."

  Scenario: The check-in is accessible
    Given three weeks of lessons have not been confirmed
    When I open the form for a lesson that did not go as planned
    Then the page has no serious accessibility violations
    When I switch to the light theme and reload
    And I open the form for a lesson that did not go as planned
    Then the page has no serious accessibility violations
