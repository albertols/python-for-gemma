@engine
Feature: Staff days

  Scenario: No lessons on a staff training day
    Given 1 Sep 2026 is labelled Week 1 and marked staff training
    Then no group has a lesson that day
