@e2e
Feature: What does not run
  Scenario: The audit groups lost lessons by reason
    Given "Mock exams" is confirmed for Year 13
    Then the slot audit lists "Mock exams" under lessons that will not run, with a count for 13 1

  Scenario: Exams are listed with the last lesson
    Then the slot audit shows "WBS14 01" on Tuesday 1 June 2027 for 13 1, 13 3 and 13 5

  Scenario: Study leave moves the last lesson earlier
    Given "Study leave starts" is confirmed for 13 1, 13 3 and 13 5 until 29 June 2027
    Then the last lesson of 13 1 on the slot audit is on or before 7 May 2027

  Scenario: Setup lists the official exams with their sources
    When I open the official exams in Setup
    Then I see the exams "4BS1 01", "4BS1 02" and "WBS14 01", each with a source link

  Scenario: An exam I add shows in Coming up, and one I remove goes
    When I add the exam "MOCK 1" called "Year 13 mock paper" on 27 November 2026 for 13 1
    Then Today lists "MOCK 1 Year 13 mock paper" under Coming up
    When I remove the exam "MOCK 1"
    Then Today does not list "MOCK 1 Year 13 mock paper" under Coming up

  Scenario: A title that is too long is refused
    When I try to add an exam called with 121 characters
    Then I am told the title can be at most 120 characters

  Scenario: The audit is accessible
    When I open the slot audit
    Then the page has no serious accessibility violations

  Scenario: The audit is accessible in the light theme
    When I open the slot audit
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: The official exams card is accessible
    When I open the official exams in Setup
    Then the page has no serious accessibility violations

  Scenario: The official exams card is accessible in the light theme
    When I open the official exams in Setup
    And I switch to the light theme and reload
    Then the theme is light
    And the page has no serious accessibility violations

  Scenario: The exam form is accessible
    When I open the form to add an exam
    Then the page has no serious accessibility violations
