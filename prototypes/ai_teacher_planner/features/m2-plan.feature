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
    When I press "See what changes" on the board
    Then the proposal lists 13 1's lesson from Monday 23 November first

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
