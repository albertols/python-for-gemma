@engine
Feature: Report reminder

  @e2e @e2e-later
  Scenario: Report reminder
    Given the Year 11 long-report data deadline is 30 Nov 2026
    When I open Today on 20 Nov
    Then the reminder is shown with the days remaining
