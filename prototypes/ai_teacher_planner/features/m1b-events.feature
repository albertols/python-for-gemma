@e2e
Feature: Calendar events
  Scenario: Nothing is cancelled until I confirm
    When I open the board at "/board?w1=2027-01-11"
    Then the Year 13 lessons on 11 January 2027 show "Possible disruption: Mock exams"
    And the slot audit counts no cancelled lessons that week

  Scenario: Confirming the Year 13 mock week
    When I confirm that "Mock exams" cancels my Year 13 lessons
    Then the Year 13 lessons that week show as cancelled with the reason "Mock exams"
    And IB S lessons that week are unchanged

  Scenario: Study leave lasts until the end of the year
    When I confirm "Study leave starts" for 13 1, 13 3 and 13 5 lasting until 29 June 2027
    Then the slot audit shows no Year 13 lessons after 7 May 2027

  Scenario: Undo puts the lessons back
    Given I have confirmed that "Mock exams" cancels my Year 13 lessons
    When I undo the mock week confirmation
    Then the Year 13 lessons on 11 January 2027 show "Possible disruption: Mock exams" again

  Scenario: The events list is accessible
    When I open the calendar events in Setup
    Then the page has no serious accessibility violations

  Scenario: The events list is accessible in the light theme
    When I open the calendar events in Setup
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: The confirmation details are accessible
    When I open the details for "Study leave starts"
    Then the page has no serious accessibility violations

  Scenario: The board with cancelled lessons is accessible
    Given I have confirmed that "Mock exams" cancels my Year 13 lessons
    When I open the board at the mock week
    Then the page has no serious accessibility violations

  Scenario: The board with cancelled lessons is accessible in the light theme
    Given I have confirmed that "Mock exams" cancels my Year 13 lessons
    When I open the board at the mock week
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations
