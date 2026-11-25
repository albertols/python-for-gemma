@e2e
Feature: A plan and materials for each lesson

  # Notes and files belong to the lesson, not the slot. Today is 20 November 2026, when 13 1 has
  # Markets, lesson 2 of 4. Files are small synthetic ones made by the steps, never her own.

  Scenario: A plan and a file for 13 1's lesson today
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I write the plan "Bring the pricing case study" and save it
    And I attach a small PDF called "Pricing starter.pdf"
    Then the plan "Bring the pricing case study" is shown
    And "Pricing starter.pdf" is listed under Materials
    When I remove "Pricing starter.pdf"
    Then "Pricing starter.pdf" is not listed

  Scenario: What I wrote is still there after reloading
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I write the plan "Bring the pricing case study" and save it
    And I attach a small PDF called "Pricing starter.pdf"
    And I reload and open the plan and materials for 13 1
    Then the plan "Bring the pricing case study" is shown
    And "Pricing starter.pdf" is listed under Materials

  Scenario: The board shows a paper clip with the number of files
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I attach a small PDF called "Pricing starter.pdf"
    And I attach a small PDF called "Worksheet.pdf"
    And I open the board on 16 November 2026
    Then 13 1's lesson on Friday 20 November shows a paper clip with 2 files

  Scenario: A file that is not allowed is refused with a reason
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I attach a file called "logo.svg" holding "<svg xmlns='http://www.w3.org/2000/svg'/>"
    Then I am told "Only Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, PNG or JPG files can be attached."
    And no file is listed under Materials
    When I attach a file called "fake.pdf" holding "not really a pdf"
    Then I am told "That file is not really a .pdf file, so it was not attached."
    And no file is listed under Materials

  Scenario: A file over 25 MB is stopped before it is sent
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I attach a file called "Big.pdf" of 26 MB
    Then I am told "That file is over 25 MB, so it was not attached."
    And nothing was sent to attach a file
    And no file is listed under Materials

  Scenario: A phone photo called .jpeg can be attached
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I attach a small JPEG called "Whiteboard.jpeg"
    Then "Whiteboard.jpeg" is listed under Materials

  Scenario: A lesson with no plan has no notes box
    When I look at Today
    Then no lesson offers a plan and materials

  Scenario: A lesson taken out of the scheme keeps its notes
    Given the course has an accepted plan
    And 13 1 has a plan and a file for Markets, lesson 4 of 4
    When the scheme gives Markets two lessons and the new plan is accepted
    And I look at Today
    Then under "Notes for lessons no longer in the plan" I see "13 1: Markets, lesson 4 of 4"
    And I see the plan "Case study on pricing" and "Kept.pdf" there

  Scenario: The plan and materials are accessible
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I write the plan "Bring the pricing case study" and save it
    And I attach a small PDF called "Pricing starter.pdf"
    Then the page has no serious accessibility violations

  Scenario: The plan and materials are accessible in the light theme
    Given the course has an accepted plan
    When I open the plan and materials for 13 1 on Today
    And I write the plan "Bring the pricing case study" and save it
    And I attach a small PDF called "Pricing starter.pdf"
    And I switch to the light theme and reload
    Then the theme is light
    When I open the plan and materials for 13 1 on Today
    Then the page has no serious accessibility violations
