@e2e
Feature: To-do notes
  Scenario: A note for today
    When I add the note "Print the Unit 4 case study" for today
    Then it shows under "Today"
    When I tick it
    Then it shows as done

  Scenario: An undone note carries over
    Given an undone note from 19 November 2026
    Then it shows under "Still to do"

  Scenario: A note for this week
    When I add the note "Mark the mock papers" for this week
    Then it shows under "This week"

  Scenario: A removed note is gone
    When I add the note "Print the Unit 4 case study" for today
    And I remove it
    Then it is not listed

  Scenario: Text typed in a note is shown as text, never run
    When I add the note "<b>Photos</b>" for today
    Then it shows under "Today"

  Scenario: The notes are accessible
    Given an undone note from 19 November 2026
    When I add the note "Print the Unit 4 case study" for today
    And I tick it
    Then the page has no serious accessibility violations

  Scenario: The notes are accessible in the light theme
    Given an undone note from 19 November 2026
    When I add the note "Print the Unit 4 case study" for today
    And I tick it
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations
