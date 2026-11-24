@e2e
Feature: Fortnight board
  Scenario: The board opens on the current fortnight
    When I open the board
    Then Week 1 starts on 16 November 2026 and Week 2 on 23 November 2026

  Scenario: A short week is marked
    When I open the board
    And I go to the fortnight of 14 December 2026
    Then Week 2 shows lessons on Monday and Tuesday only
    And Week 2 is marked "Short week"

  Scenario: The board follows the calendar into the next fortnight
    When I open the board
    And I press "Next fortnight"
    Then Week 1 starts on 30 November 2026 and Week 2 on 7 December 2026

  Scenario: The board is accessible
    When I open the board
    Then the page has no serious accessibility violations

  Scenario: The board is accessible in the light theme
    When I open the board
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: Every row of both weeks covers Monday to Friday
    When I open the board
    Then both week tables cover five days in every row
    When I go to the fortnight of 14 December 2026
    Then both week tables cover five days in every row

  Scenario: A lesson cell has an exact accessible name
    When I open the board
    And I go to the fortnight of 4 January 2027
    Then there is a cell named "13 1, Friday 8 January, period 6, room 206"

  Scenario: A double names its other period
    When I open the board
    Then there is a cell named "13 3, Thursday 19 November, period 3, room 202, double with period 4"
