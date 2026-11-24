@e2e
Feature: Setup
  Scenario: Importing the calendar shows the report
    When I import the school calendar
    Then I see the Week 1 and Week 2 day counts
    And the report lists the stray "x" on 31 October 2026 as a warning
    And the report says the wrong weekday on 11 July 2026 is outside the school year

  Scenario: Editing the timetable updates the totals
    When I clear 11D from Week 1 Monday period 3
    Then the fortnight total for 11D is 4
    When I save the timetable
    Then the slot audit shows 11D with fewer lessons

  Scenario: A clash is refused
    When I put 13 1 where 13 5 already is and save
    Then I see why the timetable was not saved
    And the timetable is unchanged after a reload

  Scenario: Setup is usable by keyboard and accessible
    Then I can reach every timetable cell with the keyboard
    And the page has no serious accessibility violations
