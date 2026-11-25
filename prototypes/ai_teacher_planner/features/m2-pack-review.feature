@e2e
Feature: Reviewing a curriculum pack

  Scenario: A pack with an unmapped point cannot be locked
    Given a draft pack with one spec point linked to no chapter
    Then "Lock" is disabled and says one point is not linked
    When I link that point to a chapter and mark every unit as checked
    And I lock the pack
    Then the pack is shown as locked and cannot be edited

  Scenario: Every point shows its page
    Given a draft pack with one spec point linked to no chapter
    Then each spec point shows a page reference

  Scenario: The AI's reasons and doubts are marked until the pack is locked
    Given a draft pack with one spec point linked to no chapter
    Then the link from chapter 1 to point 1.1 shows the reason "The chapter opens with the demand curve this point names." with the AI badge
    And the AI's doubt "No chapter seemed to cover this point. It may sit in a later chapter." is shown with the AI badge
    And the draft says it is not yet reviewed
    When I link that point to a chapter and mark every unit as checked
    And I lock the pack
    Then no AI badge is left on the pack

  Scenario: A unit can be left out of scope and a title corrected
    Given a draft pack with one spec point linked to no chapter
    When I correct the title of point 1.5 to "Price elasticity"
    Then point 1.5 is called "Price elasticity"
    When I mark the unit "Markets" as out of scope
    Then "Lock" is not held back by an unlinked point

  Scenario: The screen is usable by keyboard and accessible
    Given a draft pack with one spec point linked to no chapter
    Then I can open and close a unit with the keyboard
    And the page has no serious accessibility violations
    When I switch to the light theme and reload
    Then the page has no serious accessibility violations
