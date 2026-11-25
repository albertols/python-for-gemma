@engine
Feature: A one-day week

  Scenario: One lesson in one week
    Given Friday 8 Jan 2027 alone is labelled Week 1
    Then 13 1 has one lesson that week, in period 6, and no other group has any
