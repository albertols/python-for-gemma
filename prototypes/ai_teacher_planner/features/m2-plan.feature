@e2e
Feature: A plan from positions

  # The Undo scenario is the browser side of 08-undo.feature (e2e/steps/undo.steps.ts),
  # so it is not repeated here.

  Scenario: Saying where each group is leads to a proposal
    Given the course has a locked pack and a scheme but no positions
    When I set each Year 13 group's next lesson and ask for a plan
    Then I see a proposal with every group's lessons placed and no conflicts
    When I accept the proposal
    Then the board shows lesson titles on real dates

  Scenario: A stale proposal is refused
    Given a proposal is open and the scheme is then changed in another tab
    When I accept the proposal
    Then I am told the plan changed and nothing is applied
    When I ask for the new proposal
    Then the proposal can be accepted

  Scenario: Spare lessons are explained
    Given the course has an accepted plan
    When I open a spare lesson
    Then I see "A lesson this group has before the next checkpoint that the other groups do not. Use it for exam practice, support activities or independent study."

  Scenario: A lesson on a cancelled slot waits for my answer
    Given the course has an accepted plan
    When 13 1's lessons on Monday 23 November 2026 are cancelled
    Then the board draws 13 1's lesson on Monday 23 November as cancelled
    And the board and Today say "The plan is out of date"
    And the page has no serious accessibility violations
    When I press "See what changes" on the board
    Then the proposal lists "13 1, Markets 3 of 4: its lesson was cancelled. Monday 23 November, period 5 → Wednesday 25 November, period 2" first
    When I close the proposal with Escape
    Then the focus is back on "See what changes"
    And the page has no serious accessibility violations
    When I switch to the light theme and reload
    Then the page has no serious accessibility violations

  Scenario: Accepting from Today says so and keeps my place
    Given the course has an accepted plan
    When 13 1's lessons on Monday 23 November 2026 are cancelled
    And I accept the new plan from Today
    Then Today says "Plan accepted." with the focus on it
    And the page has no serious accessibility violations

  Scenario: Undo, then a new change
    Given I accepted a reflow
    When I undo it
    And I press "See what changes" on the board
    And I accept the proposal
    Then the board says "Plan accepted." with the focus on it
    And undo goes back to the first plan

  Scenario: A lesson whose slot is gone from the timetable is never silent
    Given the course has an accepted plan
    When 13 1's Week 2 Monday period 5 is taken out of the timetable
    Then the out-of-date banner says "1 lesson no longer has a lesson slot."
    When I press "See what changes" on the board
    Then the proposal lists "13 1, Markets 3 of 4: its lesson slot no longer exists. Monday 23 November, period 5 → Wednesday 25 November, period 2" first
    And the page has no serious accessibility violations

  Scenario: The board says so when the plan's status cannot be loaded
    Given the course has an accepted plan
    When the plan status cannot be loaded and I open the board
    Then the board shows "Could not load the plan status."

  Scenario: The board and dialog are accessible
    Given the course has an accepted plan
    When I open a spare lesson
    Then the page has no serious accessibility violations
    When I ask for a new plan in Setup
    Then the page has no serious accessibility violations
    When I cancel the proposal
    Then nothing is stored and the focus is back on "Ask for a plan"
    When I switch to the light theme and reload
    And I open a spare lesson
    Then the page has no serious accessibility violations
    When I ask for a new plan in Setup
    Then the page has no serious accessibility violations
