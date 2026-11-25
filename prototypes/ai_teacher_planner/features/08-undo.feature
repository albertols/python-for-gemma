@engine
Feature: Undo

  # Spec section 17, scenario 8. The engine steps run in packages/domain
  # (undo.steps.test.ts); the browser steps are in e2e/steps/undo.steps.ts.
  @e2e
  Scenario: Undo
    Given I accepted a reflow
    When I undo it
    Then the plan is exactly as before
    And the reflow is still in the history so I can see what was undone
