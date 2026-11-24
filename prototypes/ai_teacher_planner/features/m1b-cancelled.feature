@e2e
Feature: Lessons were cancelled
  Scenario: Photo day takes one lesson
    When I record that 11D's period 3 on 24 November 2026 was cancelled for "School photos"
    Then the dialog listed 1 lesson before I confirmed
    And the board shows 11D period 3 on 24 November 2026 as cancelled with "School photos"
    And the slot audit counts 1 cancelled lesson for 11D in that half-term

  Scenario: Removing it puts the lesson back
    Given I have recorded that 11D's period 3 on 24 November 2026 was cancelled for "School photos"
    When I remove "School photos" in Setup
    Then the board shows 11D period 3 on 24 November 2026 as a lesson again

  Scenario: A range with no lessons is refused
    When I try to cancel lessons on 21 November 2026 for "Saturday"
    Then I see "No lessons fall in these dates" in the dialog and nothing is stored

  Scenario: Text typed as a reason is shown as text, never run
    When I record that 11D's period 3 on 24 November 2026 was cancelled for "<b>Photos</b>"
    Then the board shows 11D period 3 on 24 November 2026 as cancelled with "<b>Photos</b>"

  Scenario: The dialog is accessible
    When I open the cancel dialog
    Then the page has no serious accessibility violations

  Scenario: The dialog is accessible in the light theme
    When I open the app
    And I switch to the light theme and reload
    And I open the cancel dialog
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: Setup with a cancellation is accessible
    Given I have recorded that 11D's period 3 on 24 November 2026 was cancelled for "School photos"
    When I open Setup
    Then the page has no serious accessibility violations

  Scenario: Setup with a cancellation is accessible in the light theme
    Given I have recorded that 11D's period 3 on 24 November 2026 was cancelled for "School photos"
    When I open Setup
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations
