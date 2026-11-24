@engine
Feature: The allowlist holds

  Scenario: The allowlist holds
    Given a path inside a student-work folder
    When anything asks the gateway for it
    Then it is refused
