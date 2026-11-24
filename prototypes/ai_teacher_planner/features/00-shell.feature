@e2e
Feature: The app opens

  Scenario: The shell loads and is accessible
    When I open the app
    Then I see the navigation with "Today", "Board", "Slot audit" and "Setup"
    And the page has no serious accessibility violations

  Scenario: Theme
    When I open the app
    Then the theme is dark
    When I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: The API is not running
    Given the API does not answer
    When I open the app
    Then I see "The planner is not running" and how to start it
