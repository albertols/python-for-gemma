@e2e
Feature: Scheme of work

  Scenario: Totals follow my edits at once
    Given the planner holds a planned scheme of work
    When I change the chapter "Markets" from 4 lessons to 6
    Then the teaching total goes up by 2 for every group without the page reloading
    And the chapter "Markets" shows 2 weeks for 13 1

  Scenario: Importing my planning sheet is a preview
    Given the planner holds a planned scheme of work
    And I have saved 5 lessons for "Supply"
    When I import the planning sheet
    Then I see that the sheet states 10 but its chapters add up to 13
    And the preview says "Supply" would change
    And nothing is saved until I accept
    When I accept the import
    Then "Supply" is saved with 4 lessons

  Scenario: A planning file that cannot be read gets one plain sentence
    Given the planner holds a planned scheme of work
    When I import the file "Unreadable Sheet.xlsx"
    Then the import says "That file could not be read as a planning sheet or an assessment schedule."
    And the import shows no preview and offers nothing to accept

  Scenario: A lesson-count suggestion is shown as a difference
    Given the planner holds a planned scheme of work
    When I ask for lesson-count suggestions
    Then one chapter shows "4 → 5" with the AI badge and a reason
    And her number for "Markets" is still 4
    When I accept it
    Then the chapter "Markets" has 5 lessons and a small sparkle

  Scenario: A suggestion can be rejected
    Given the planner holds a planned scheme of work
    When I ask for lesson-count suggestions
    And I reject it
    Then no suggestion is left on the page
    And her number for "Markets" is still 4

  Scenario: The scheme does not fit
    Given the planner holds a planned scheme of work
    When I add 200 lessons to the chapter "Prices"
    Then each group's total shows how many lessons do not fit

  Scenario: Reordering by keyboard, and saving what I changed
    Given the planner holds a planned scheme of work
    When I move the chapter "Prices" up with the keyboard
    Then "Prices" comes before the 12 mark assessment
    When I save the scheme
    And I reload the scheme page
    Then "Prices" comes before the 12 mark assessment

  Scenario: A new chapter is marked as not linked to the specification
    Given the planner holds a planned scheme of work
    When I add a chapter and a project
    Then the new chapter says it is not linked to the specification
    And the new project does not

  Scenario: Revision weeks are set on the scheme
    Given the planner holds a planned scheme of work
    When I set the revision weeks to 3 and save them
    Then the course keeps 3 revision weeks

  Scenario: The screen is accessible
    Given the planner holds a planned scheme of work
    Then the page has no serious accessibility violations
    When I switch to the light theme and reload
    Then the page has no serious accessibility violations
