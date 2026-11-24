import { expect, test } from "vitest";
import { groupsParam, parseGroups, toggleGroup } from "./group-filter.ts";

const known = ["11D", "13 1", "13 3"];

test("the address names groups by id, comma separated", () => {
  expect(parseGroups("13 1,13 3", known)).toEqual(new Set(["13 1", "13 3"]));
});
test("an unknown id is ignored", () => {
  expect(parseGroups("13 1,nope", known)).toEqual(new Set(["13 1"]));
});
test("an empty, absent or all-unknown value means all groups", () => {
  expect(parseGroups(null, known)).toBeNull();
  expect(parseGroups("", known)).toBeNull();
  expect(parseGroups("nope", known)).toBeNull();
});
test("the first toggle picks one group, a second adds, the last off means all", () => {
  const one = toggleGroup(null, "13 1");
  expect(one).toEqual(new Set(["13 1"]));
  const two = toggleGroup(one, "13 3");
  expect(two).toEqual(new Set(["13 1", "13 3"]));
  expect(toggleGroup(two, "13 1")).toEqual(new Set(["13 3"]));
  expect(toggleGroup(new Set(["13 3"]), "13 3")).toBeNull();
});
test("the address value follows the order of the groups, and all clears it", () => {
  expect(groupsParam(new Set(["13 3", "11D"]), known)).toBe("11D,13 3");
  expect(groupsParam(null, known)).toBeNull();
});
