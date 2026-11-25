@e2e
Feature: Today and slot audit
  Scenario: Today on a teaching day
    When I open the app
    Then I see "Friday 20 November 2026" and "Week 1"
    And I see the lesson "13 1" at 15:30 in room 206

  Scenario: Today on a day off says why and names the next teaching day
    Given the planner says today is Monday 12 October 2026
    When I open the app
    Then I see "Monday 12 October 2026" and "Official Holiday"
    And I see "No lessons today"
    And the next teaching day, Tuesday 13 October 2026, links to its fortnight on the board

  Scenario: Today on a labelled official holiday says there are no lessons
    Given the planner says today is Tuesday 8 December 2026, a labelled holiday
    When I open the app
    Then I see "Official holiday — no lessons"

  Scenario: Before any import Today offers the import
    Given the planner has no calendar yet
    When I open the app
    Then I see one action "Import the school calendar"

  Scenario: The slot audit explains a day off
    When I open the slot audit
    Then I see the audit's guiding sentence
    And I see lessons per group for each teaching block
    And I see that Monday 12 October 2026 was "Official Holiday" and what each group missed
    And I see that Tuesday 8 December 2026 was "Official holiday" and what each group missed
    And I see that no lessons have been lost

  Scenario: Today is accessible
    When I open the app
    Then the page has no serious accessibility violations

  Scenario: Today is accessible in the light theme
    When I open the app
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: The slot audit is accessible
    When I open the slot audit
    Then the page has no serious accessibility violations

  Scenario: The slot audit is accessible in the light theme
    When I open the slot audit
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations
