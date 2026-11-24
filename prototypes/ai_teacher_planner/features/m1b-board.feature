@e2e
Feature: Board views
  Scenario: Filtering to one class
    When I open the board
    And I show only 13 1 on the board
    Then every lesson on the board is 13 1
    And both week tables cover five days in every row
    And the address keeps the filter after a reload

  Scenario: One week at a time
    When I open the board
    Then the Fortnight button is pressed and the Week button is not
    When I switch the board to Week
    Then the Week button is pressed and the Fortnight button is not
    And I see one week, and "Next week" moves by seven days

  Scenario: The last day before the winter holiday is marked
    When I open the board on 22 December 2026
    Then that day says "Last day before the holiday"

  Scenario: Today says when it is the last day before the holiday
    Given the planner says today is Tuesday 22 December 2026, the last day before the holiday
    When I open Today
    Then Today says "Last day before the holiday"

  Scenario: Both views are accessible
    When I open the board
    And I show only 13 1 on the board
    Then the page has no serious accessibility violations
    When I switch the board to Week
    Then the page has no serious accessibility violations
