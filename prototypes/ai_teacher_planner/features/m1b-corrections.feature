@e2e
Feature: Correcting the calendar
  Scenario: A day off is confirmed from the import report
    When I import the synthetic calendar
    And I choose "No lessons that day" for 19 March 2027 with the reason "Staff training"
    Then the slot audit lists 19 March 2027 lessons as cancelled with "Staff training"

  Scenario: Undoing the decision puts the lessons back
    When I import the synthetic calendar
    And I choose "No lessons that day" for 19 March 2027 with the reason "Staff training"
    And I undo the decision for 19 March 2027
    Then the slot audit lists no lessons on 19 March 2027 as cancelled

  Scenario: A week label is corrected
    When I import the synthetic calendar
    Then the report shows 4 May 2027 as Week 2
    When I change the week label of 4 May 2027 to Week 1
    Then the board shows 4 May 2027 as Week 1, marked corrected

  Scenario: Notes outside the school year are folded away
    When I import the synthetic calendar
    Then the import report shows one line "Outside the school year" and no warning dated in August

  Scenario: The report is accessible
    When I import the synthetic calendar
    And I open the notes outside the school year
    Then the page has no serious accessibility violations

  Scenario: The report is accessible while a decision is being made
    When I import the synthetic calendar
    And I start choosing "No lessons that day" for 19 March 2027
    Then the page has no serious accessibility violations

  Scenario: The report is accessible in the light theme
    When I import the synthetic calendar
    And I choose "No lessons that day" for 19 March 2027 with the reason "Staff training"
    And I switch to the light theme and reload
    And I open the notes outside the school year
    Then the theme is light
    And the page has no serious accessibility violations
