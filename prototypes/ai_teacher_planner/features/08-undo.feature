@engine
Feature: Undo

  # Spec section 17, scenario 8. The engine steps run in packages/domain
  # (undo.steps.test.ts). Task 2.17 writes the browser steps and removes @e2e-later.
  @e2e @e2e-later
  Scenario: Undo
    Given I accepted a reflow
    When I undo it
    Then the plan is exactly as before
    And the reflow is still in the history so I can see what was undone
