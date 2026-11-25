@e2e
Feature: AI is marked

  Scenario: A suggestion awaiting review is marked by icon and outline
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    Then I see one run of "planner-suggest-lesson-counts" by the fake provider
    And its suggestion has the "AI suggestion, not reviewed" badge and a dashed outline

  Scenario: Where a suggestion came from
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    And I open where the suggestion came from
    Then it names the provider "fake", the model "fake" and the skill "planner-suggest-lesson-counts"
    And it says there were no sources

  Scenario: Escape closes the popover first, then the drawer
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    And I open where the suggestion came from
    And I press Escape once
    Then the drawer is still open and the popover is closed
    And the focus is back on "Where this came from"
    When I press Escape once
    Then the drawer is closed
    And the focus is back on "AI activity (1 to review)"

  Scenario: Escape closes only the layer on top
    Given the fake AI has suggested a lesson count
    When I open the legend and then the activity drawer with the keyboard
    And I press Escape once
    Then the drawer is closed
    And the legend is still open
    When I press Escape once
    Then the legend is closed

  Scenario: The page behind the open drawer cannot be reached
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    Then nothing behind the drawer can take focus

  Scenario: Accepting a suggestion changes its mark
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    And I accept the suggestion
    Then the suggestion has the "AI suggestion, accepted" badge and no dashed outline
    And the suggestion says "Recorded. The scheme uses it once the scheme screen is built."

  Scenario: Editing a suggestion changes its mark
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    And I edit the suggestion to 6 lessons
    Then the suggestion has the "AI suggestion, edited by you" badge and no dashed outline
    And the suggestion says "Markets: 4 to 6 lessons"

  Scenario: The legend explains the marks
    When I open the legend
    Then the legend says "Everything without the sparkle is calculated from your calendar and timetable."

  Scenario: A running job shows its progress and can be cancelled
    Given a job is running with the note "Reading the scheme"
    When I open the board
    Then the header says "AI is working: Reading the scheme"
    When I cancel the running job
    Then the planner was asked to cancel that job

  Scenario: AI is unavailable
    Given AI is switched off
    When I open the board
    Then the header says AI is off and the board still opens

  Scenario: Claude Code is signed out
    Given Claude Code is signed out
    When I open the board
    Then the header says "AI unavailable: Claude Code is signed out. Run `claude` in a terminal and sign in, then try again."

  Scenario: The AI components are accessible in both themes
    Given the fake AI has suggested a lesson count
    When I open the activity drawer
    And I open where the suggestion came from
    Then the page has no serious accessibility violations
    When I close the activity drawer
    And I switch to the light theme and reload
    And I open the activity drawer
    And I open where the suggestion came from
    Then the page has no serious accessibility violations

  Scenario: The legend is accessible in both themes
    When I open the legend
    Then the page has no serious accessibility violations
    When I press Escape
    And I switch to the light theme and reload
    And I open the legend
    Then the page has no serious accessibility violations
