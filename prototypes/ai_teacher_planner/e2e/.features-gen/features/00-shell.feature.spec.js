// Generated from: ../features/00-shell.feature
import { test } from "../../support/fixtures.ts";

test.describe('The app opens', () => {

  test('The shell loads and is accessible', { tag: ['@e2e'] }, async ({ When, Then, And, page }) => { 
    await When('I open the app', null, { page }); 
    await Then('I see the navigation with "Today", "Board", "Slot audit" and "Setup"', null, { page }); 
    await And('the page has no serious accessibility violations', null, { page }); 
  });

  test('Theme', { tag: ['@e2e'] }, async ({ When, Then, page }) => { 
    await When('I open the app', null, { page }); 
    await Then('the theme is dark', null, { page }); 
    await When('I switch to the light theme and reload', null, { page }); 
    await Then('the theme is light', null, { page }); 
  });

  test('The API is not running', { tag: ['@e2e'] }, async ({ Given, When, Then, page }) => { 
    await Given('the API does not answer', null, { page }); 
    await When('I open the app', null, { page }); 
    await Then('I see "The planner is not running" and how to start it', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('../features/00-shell.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":4,"tags":["@e2e"],"steps":[{"pwStepLine":7,"gherkinStepLine":5,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":6,"keywordType":"Outcome","textWithKeyword":"Then I see the navigation with \"Today\", \"Board\", \"Slot audit\" and \"Setup\"","stepMatchArguments":[{"group":{"start":26,"value":"\"Today\"","children":[{"start":27,"value":"Today","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"},{"group":{"start":35,"value":"\"Board\"","children":[{"start":36,"value":"Board","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"},{"group":{"start":44,"value":"\"Slot audit\"","children":[{"start":45,"value":"Slot audit","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"},{"group":{"start":61,"value":"\"Setup\"","children":[{"start":62,"value":"Setup","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]},{"pwStepLine":9,"gherkinStepLine":7,"keywordType":"Outcome","textWithKeyword":"And the page has no serious accessibility violations","stepMatchArguments":[]}]},
  {"pwTestLine":12,"pickleLine":9,"tags":["@e2e"],"steps":[{"pwStepLine":13,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then the theme is dark","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":12,"keywordType":"Action","textWithKeyword":"When I switch to the light theme and reload","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":13,"keywordType":"Outcome","textWithKeyword":"Then the theme is light","stepMatchArguments":[]}]},
  {"pwTestLine":19,"pickleLine":15,"tags":["@e2e"],"steps":[{"pwStepLine":20,"gherkinStepLine":16,"keywordType":"Context","textWithKeyword":"Given the API does not answer","stepMatchArguments":[]},{"pwStepLine":21,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":22,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"Then I see \"The planner is not running\" and how to start it","stepMatchArguments":[{"group":{"start":6,"value":"\"The planner is not running\"","children":[{"start":7,"value":"The planner is not running","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end