@engine
Feature: The cycle comes from the calendar

  @e2e
  Scenario: The cycle comes from the calendar
    Given 12 Feb 2027 is labelled Week 2 and 15 to 19 Feb are school holidays
    When I open the week of 22 Feb
    Then it is Week 1
    And each group has its Week 1 lessons
