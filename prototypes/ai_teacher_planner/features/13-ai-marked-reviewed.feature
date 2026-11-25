@engine @e2e @e2e-later
Feature: AI is marked and reviewed

  # Spec section 17, scenario 13. The engine steps run in packages/exporters
  # (ai-marked.steps.test.ts). Task 5.7 writes the browser steps (the sparkle and
  # dashed outline, and the Export menu's warning) and removes @e2e-later.
  Scenario: An AI suggestion I have not reviewed is left out of an export, with a warning
    Given a lesson drafted by AI that I have not reviewed
    When I export the fortnight to Excel
    Then the lesson is not in the workbook
    And I am warned that 1 AI suggestion was left out
