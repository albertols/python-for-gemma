@engine
Feature: A two-day week

  Scenario: Only the first two days of Week 2 exist
    Given 21 and 22 Dec 2026 are labelled Week 2
    Then only the Monday and Tuesday Week 2 lessons exist that week
