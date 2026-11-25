@engine
Feature: A schedule from my documents

  # Spec section 17, scenario 5 (Gemma's story 1). The engine steps run on the
  # synthetic year in packages/domain; Task 2.13 adds the full-year version with
  # her planning sheet (70 teaching lessons across chapters 22 to 37, of which 65
  # are for this year: chapter 22's five were taught in Year 12). Task 2.21 writes
  # the browser steps (e2e/steps/schedule.steps.ts).
  @e2e
  Scenario: Story 1: a schedule from my documents
    Given the calendar, my timetable and the IAL Unit 4 scheme with my class counts
    When I choose 13 1, 13 3 and 13 5 and my teaching order
    Then I see a dated schedule per group in which every lesson sits on a real lesson of that group
    And no lesson falls on a holiday
    And chapter order is kept
    And each chapter shows its spec reference
    And the teaching-lesson total matches my sheet
    And spare lessons appear as flex lessons before each assessment
