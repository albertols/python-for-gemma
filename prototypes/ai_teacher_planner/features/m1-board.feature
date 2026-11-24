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
