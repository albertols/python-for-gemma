@e2e
Feature: A timetable from a picture

  Scenario: A picture is read into a suggested grid beside mine, and nothing changes until I accept
    When I upload a picture of my timetable
    Then the suggested grid sits beside my timetable with 2 changed cells marked
    And Claude lists the cell it could not read: "Week 1, Tuesday, period 1: The code in this cell is smudged."
    And the stored timetable still has 13 5 in Week 1 Tuesday period 1
    And the page has no serious accessibility violations

  Scenario: Accepting the suggestion replaces my grid
    When I upload a picture of my timetable
    And I accept the suggested grid
    Then Week 1 Tuesday period 1 is empty and Week 1 Monday period 1 has room 607
    And the stored timetable has no lesson in Week 1 Tuesday period 1

  Scenario: Rejecting the suggestion leaves my grid as it was
    When I upload a picture of my timetable
    And I reject the suggested grid
    Then no suggested grid is left on the page
    And the stored timetable still has 13 5 in Week 1 Tuesday period 1

  Scenario: A file that is not a picture is refused and nothing is suggested
    When I upload a file that is not a picture
    Then I am told it is not really a PNG file
    And no suggested grid is left on the page
