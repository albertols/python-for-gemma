@e2e
Feature: Fortnight board
  Scenario: The board opens on the current fortnight
    When I open the board
    Then Week 1 starts on 16 November 2026 and Week 2 on 23 November 2026

  Scenario: The board follows the calendar into the next fortnight
    When I open the board
    And I press "Next fortnight"
    Then Week 1 starts on 30 November 2026 and Week 2 on 7 December 2026

  Scenario: The address opens the fortnight holding any date in it
    When I open the board at "/board?w1=2026-12-21"
    Then Week 1 starts on 14 December 2026 and Week 2 on 21 December 2026

  Scenario: A Monday in Week 2 of a fortnight opens that fortnight
    When I open the board at "/board?w1=2026-12-08"
    Then Week 1 starts on 30 November 2026 and Week 2 on 7 December 2026

  Scenario: An address that is not a date opens this fortnight
    When I open the board at "/board?w1=tomorrow"
    Then Week 1 starts on 16 November 2026 and Week 2 on 23 November 2026

  Scenario: An impossible day in the address opens this fortnight
    When I open the board at "/board?w1=2026-02-30"
    Then Week 1 starts on 16 November 2026 and Week 2 on 23 November 2026

  Scenario: An impossible month in the address opens this fortnight
    When I open the board at "/board?w1=2026-13-01"
    Then Week 1 starts on 16 November 2026 and Week 2 on 23 November 2026

  Scenario: An address date with no fortnight on or after it says so
    When I open the board at "/board?w1=2030-01-01"
    Then the board says "There is no fortnight on or after 1 January 2030."

  Scenario: A labelled official holiday has no lessons
    When I open the board
    And I go to the fortnight of 30 November 2026
    Then Tuesday 8 December 2026 is a day without lessons that says "Official holiday"

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
